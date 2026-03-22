import os
import sqlite3
from config import Config
from cryptography.fernet import Fernet

# prepare encryption cipher if key provided
_db_key = os.environ.get('DB_ENCRYPTION_KEY', '') or None
cipher = None
if _db_key:
    try:
        # key should be 32 url-safe base64-encoded bytes
        cipher = Fernet(_db_key)
    except Exception:
        # if provided key isn't valid, log warning and disable
        print('[Warning] Invalid DB_ENCRYPTION_KEY; chat history will not be encrypted')
        cipher = None

def _encrypt(val):
    if cipher and val is not None:
        return cipher.encrypt(val.encode()).decode()
    return val

def _decrypt(val):
    if cipher and val is not None:
        try:
            return cipher.decrypt(val.encode()).decode()
        except Exception:
            return val
    return val

def get_db_connection():
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY DEFAULT 1,
            prompts_scanned INTEGER DEFAULT 0,
            sensitive_prompts_detected INTEGER DEFAULT 0,
            files_uploaded INTEGER DEFAULT 0,
            files_encrypted INTEGER DEFAULT 0
        )
    ''')
    # chat history table stores every user interaction for auditing
    conn.execute('''
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT DEFAULT (datetime('now')),
            original_prompt TEXT,
            masked_prompt TEXT,
            response TEXT,
            sensitive INTEGER DEFAULT 0,
            user_locked INTEGER DEFAULT 0
        )
    ''')
    # ensure user_locked column exists if older database
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(chat_history)")
    cols = [r['name'] for r in cur.fetchall()]
    if 'user_locked' not in cols:
        conn.execute('ALTER TABLE chat_history ADD COLUMN user_locked INTEGER DEFAULT 0')
    conn.commit()
    # settings table for storing misc key/value pairs (e.g. history password hash)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    ''')
    # Initialize row if empty
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM stats')
    if cur.fetchone()[0] == 0:
        cur.execute('INSERT INTO stats (id) VALUES (1)')
    conn.commit()
    conn.close()

def update_stat(column_name):
    conn = get_db_connection()
    query = f"UPDATE stats SET {column_name} = {column_name} + 1 WHERE id = 1"
    conn.execute(query)
    conn.commit()
    conn.close()

# history helpers --------------------------------------------------------------

def save_chat(original_prompt, masked_prompt, response, sensitive=False):
    """Record a chat interaction; sensitive=bool."""
    # encrypt values if cipher available
    enc_orig = _encrypt(original_prompt)
    enc_mask = _encrypt(masked_prompt)
    enc_resp = _encrypt(response)
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        'INSERT INTO chat_history (original_prompt, masked_prompt, response, sensitive, user_locked) VALUES (?,?,?,?,?)',
        (enc_orig, enc_mask, enc_resp, 1 if sensitive else 0, 0)
    )
    last_id = cur.lastrowid
    conn.commit()
    conn.close()
    return last_id


def get_history(include_sensitive=False, include_locked=False):
    conn = get_db_connection()
    cur = conn.cursor()
    base = 'SELECT * FROM chat_history'
    conditions = []
    if not include_sensitive:
        conditions.append('sensitive = 0')
    if not include_locked:
        conditions.append('user_locked = 0')
    if conditions:
        base += ' WHERE ' + ' AND '.join(conditions)
    base += ' ORDER BY id DESC'
    cur.execute(base)
    rows = cur.fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        # decrypt fields if needed
        d['original_prompt'] = _decrypt(d.get('original_prompt'))
        d['masked_prompt'] = _decrypt(d.get('masked_prompt'))
        d['response'] = _decrypt(d.get('response'))
        results.append(d)
    return results


def set_setting(key, value):
    conn = get_db_connection()
    conn.execute('REPLACE INTO settings (key, value) VALUES (?,?)', (key, value))
    conn.commit()
    conn.close()

def toggle_lock(entry_id, lock=True):
    conn = get_db_connection()
    conn.execute('UPDATE chat_history SET user_locked = ? WHERE id = ?', (1 if lock else 0, entry_id))
    conn.commit()
    conn.close()


def delete_history(entry_id=None):
    """Remove chat history entries.
    If entry_id is None the entire history table is cleared; otherwise only the
    specified row is deleted."""
    conn = get_db_connection()
    if entry_id is None:
        conn.execute('DELETE FROM chat_history')
    else:
        conn.execute('DELETE FROM chat_history WHERE id = ?', (entry_id,))
    conn.commit()
    conn.close()


def get_setting(key):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT value FROM settings WHERE key = ?', (key,))
    row = cur.fetchone()
    conn.close()
    return row['value'] if row else None

def get_stats():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute('SELECT * FROM stats WHERE id = 1')
    row = cur.fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"prompts_scanned": 0, "sensitive_prompts_detected": 0, "files_uploaded": 0, "files_encrypted": 0}
