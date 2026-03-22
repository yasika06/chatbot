import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'default-secret-key-for-dev')
    OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
    
    # Use /tmp for serverless (Vercel) environments to avoid read-only filesystem errors
    if os.environ.get('VERCEL') or os.environ.get('VERCEL_ENV'):
        BASE_DIR = '/tmp'
    else:
        BASE_DIR = os.path.dirname(__file__)

    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    ENCRYPTED_FOLDER = os.path.join(BASE_DIR, 'encrypted_uploads')
    DATABASE_PATH = os.path.join(BASE_DIR, 'privacy_bot.db')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max upload
