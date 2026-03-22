import sqlite3
from config import Config

conn = sqlite3.connect(Config.DATABASE_PATH)
cur = conn.cursor()
for row in cur.execute('SELECT id, original_prompt, masked_prompt, response FROM chat_history'):
    print(row)
conn.close()
