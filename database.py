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

def format_title(text):
    """Format raw prompt into a clean, ChatGPT-style title."""
    if not text:
        return 'New Chat'
    import re
    s = re.sub(r'\s+', ' ', text).strip()
    if not s:
        return 'New Chat'
    # Capitalize first letter of each word if all lowercase, or capitalize first letter
    if s == s.lower():
        s = ' '.join(w.capitalize() for w in s.split())
    else:
        s = s[0].upper() + s[1:]
    if len(s) > 42:
        s = s[:40].strip() + '...'
    return s

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
    # Chat sessions table stores conversation sessions (ChatGPT style)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    ''')
    # chat history table stores every user interaction
    conn.execute('''
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            timestamp TEXT DEFAULT (datetime('now')),
            original_prompt TEXT,
            masked_prompt TEXT,
            response TEXT,
            sensitive INTEGER DEFAULT 0,
            user_locked INTEGER DEFAULT 0
        )
    ''')
    # ensure columns exist in older database
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(chat_history)")
    cols = [r['name'] for r in cur.fetchall()]
    if 'user_locked' not in cols:
        conn.execute('ALTER TABLE chat_history ADD COLUMN user_locked INTEGER DEFAULT 0')
    if 'session_id' not in cols:
        conn.execute('ALTER TABLE chat_history ADD COLUMN session_id TEXT')
    conn.commit()

    # settings table for storing misc key/value pairs
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

    # Legacy migration: group unassigned rows into sessions
    _migrate_legacy_rows_to_sessions(conn)

    conn.close()

def _migrate_legacy_rows_to_sessions(conn):
    """Group rows where session_id IS NULL into realistic conversation sessions."""
    from datetime import datetime
    import uuid

    cur = conn.cursor()
    rows = cur.execute('SELECT id, timestamp, original_prompt, masked_prompt FROM chat_history WHERE session_id IS NULL ORDER BY id ASC').fetchall()
    if not rows:
        return

    sessions = []
    curr_session = []
    prev_time = None

    for r in rows:
        t_str = r['timestamp']
        try:
            t = datetime.strptime(t_str, '%Y-%m-%d %H:%M:%S')
        except Exception:
            try:
                t = datetime.fromisoformat(t_str)
            except Exception:
                t = datetime.now()
        # Group if within 15 minutes
        if prev_time is None or (t - prev_time).total_seconds() > 900:
            if curr_session:
                sessions.append(curr_session)
            curr_session = [r]
        else:
            curr_session.append(r)
        prev_time = t

    if curr_session:
        sessions.append(curr_session)

    for sess_rows in sessions:
        sess_id = f"sess_{sess_rows[0]['id']}_{uuid.uuid4().hex[:6]}"
        first_prompt = _decrypt(sess_rows[0]['original_prompt'] or sess_rows[0]['masked_prompt']) or 'Conversation'
        title = format_title(first_prompt)
        first_time = sess_rows[0]['timestamp']
        last_time = sess_rows[-1]['timestamp']

        conn.execute(
            'INSERT OR IGNORE INTO chat_sessions (id, title, created_at, updated_at) VALUES (?,?,?,?)',
            (sess_id, title, first_time, last_time)
        )
        row_ids = [r['id'] for r in sess_rows]
        placeholders = ','.join('?' for _ in row_ids)
        conn.execute(f'UPDATE chat_history SET session_id = ? WHERE id IN ({placeholders})', [sess_id] + row_ids)

    conn.commit()

def update_stat(column_name):
    conn = get_db_connection()
    query = f"UPDATE stats SET {column_name} = {column_name} + 1 WHERE id = 1"
    conn.execute(query)
    conn.commit()
    conn.close()

# session & history helpers -----------------------------------------------------

def get_sessions():
    """Return all chat sessions sorted by latest activity."""
    conn = get_db_connection()
    cur = conn.cursor()
    # Query sessions with message count
    query = '''
        SELECT s.id, s.title, s.created_at, s.updated_at,
               COUNT(h.id) AS message_count
        FROM chat_sessions s
        LEFT JOIN chat_history h ON s.id = h.session_id
        GROUP BY s.id
        ORDER BY s.updated_at DESC
    '''
    rows = cur.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_session(session_id):
    """Return session metadata and all messages in order."""
    conn = get_db_connection()
    cur = conn.cursor()
    s_row = cur.execute('SELECT * FROM chat_sessions WHERE id = ?', (session_id,)).fetchone()
    if not s_row:
        conn.close()
        return None

    sess = dict(s_row)
    # Fetch all messages in this session
    m_rows = cur.execute(
        'SELECT * FROM chat_history WHERE session_id = ? ORDER BY id ASC',
        (session_id,)
    ).fetchall()
    conn.close()

    messages = []
    for r in m_rows:
        d = dict(r)
        d['original_prompt'] = _decrypt(d.get('original_prompt'))
        d['masked_prompt'] = _decrypt(d.get('masked_prompt'))
        d['response'] = _decrypt(d.get('response'))
        messages.append(d)

    sess['messages'] = messages
    return sess

def create_or_update_session(session_id, prompt_for_title=None):
    """Ensure session exists in chat_sessions, updating updated_at."""
    conn = get_db_connection()
    cur = conn.cursor()
    exists = cur.execute('SELECT id FROM chat_sessions WHERE id = ?', (session_id,)).fetchone()
    if exists:
        conn.execute("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?", (session_id,))
    else:
        title = format_title(prompt_for_title) if prompt_for_title else 'New Chat'
        conn.execute(
            "INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
            (session_id, title)
        )
    conn.commit()
    conn.close()

def delete_session(session_id):
    """Delete a session and all its messages."""
    conn = get_db_connection()
    conn.execute('DELETE FROM chat_history WHERE session_id = ?', (session_id,))
    conn.execute('DELETE FROM chat_sessions WHERE id = ?', (session_id,))
    conn.commit()
    conn.close()

def save_chat(original_prompt, masked_prompt, response, sensitive=False, session_id=None):
    """Record a chat interaction linked to a session."""
    # encrypt values if cipher available
    enc_orig = _encrypt(original_prompt)
    enc_mask = _encrypt(masked_prompt)
    enc_resp = _encrypt(response)
    conn = get_db_connection()
    cur = conn.cursor()

    if session_id:
        # Check if session exists; if not, create it with title from this prompt
        s_row = cur.execute('SELECT id, title FROM chat_sessions WHERE id = ?', (session_id,)).fetchone()
        if not s_row:
            title = format_title(original_prompt or masked_prompt)
            conn.execute(
                "INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))",
                (session_id, title)
            )
        else:
            conn.execute("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?", (session_id,))

    cur.execute(
        'INSERT INTO chat_history (session_id, original_prompt, masked_prompt, response, sensitive, user_locked) VALUES (?,?,?,?,?,?)',
        (session_id, enc_orig, enc_mask, enc_resp, 1 if sensitive else 0, 0)
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
    """Remove chat history entries and clean up chat sessions.
    If entry_id is None the entire history table and sessions are cleared;
    otherwise only the specified row is deleted."""
    conn = get_db_connection()
    if entry_id is None:
        conn.execute('DELETE FROM chat_history')
        conn.execute('DELETE FROM chat_sessions')
    else:
        # Check session_id of the row being deleted
        cur = conn.cursor()
        row = cur.execute('SELECT session_id FROM chat_history WHERE id = ?', (entry_id,)).fetchone()
        conn.execute('DELETE FROM chat_history WHERE id = ?', (entry_id,))
        if row and row['session_id']:
            sess_id = row['session_id']
            # If no remaining messages in this session, delete session row too
            remaining = cur.execute('SELECT COUNT(*) FROM chat_history WHERE session_id = ?', (sess_id,)).fetchone()[0]
            if remaining == 0:
                conn.execute('DELETE FROM chat_sessions WHERE id = ?', (sess_id,))
    conn.commit()
    conn.close()

def reset_file_stats():
    """Reset uploaded and encrypted file counters to 0 in stats table."""
    conn = get_db_connection()
    conn.execute('UPDATE stats SET files_uploaded = 0, files_encrypted = 0 WHERE id = 1')
    conn.commit()
    conn.close()

def delete_file_history_entries():
    """Delete chat history entries that represent file uploads."""
    conn = get_db_connection()
    # Delete entries starting with file paperclip emoji or referencing file processed
    conn.execute("DELETE FROM chat_history WHERE original_prompt LIKE '📎%' OR original_prompt LIKE '%processed successfully%' OR response LIKE '%processed successfully%'")
    # Clean up any empty sessions left behind
    conn.execute("DELETE FROM chat_sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM chat_history WHERE session_id IS NOT NULL)")
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
