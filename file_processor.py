import os
import string
import random
import PyPDF2
import docx
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
from config import Config

def extract_text_from_file(filepath):
    """Extract text from supported file types."""
    ext = os.path.splitext(filepath)[1].lower()
    text = ""
    
    try:
        if ext == '.txt':
            with open(filepath, 'r', encoding='utf-8') as f:
                text = f.read()
        elif ext == '.pdf':
            with open(filepath, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        elif ext == '.docx':
            doc = docx.Document(filepath)
            for para in doc.paragraphs:
                text += para.text + "\n"
    except Exception as e:
        print(f"Error reading file {filepath}: {e}")
        
    return text

def generate_password(length=12):
    """Generate a random password for file encryption."""
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for i in range(length))

def get_key_from_password(password, salt=b'privacy_shield_salt'):
    """Derive a cryptographic key from a password."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return key

def encrypt_file(filepath, filename):
    """
    Encrypts the file found at filepath. 
    Returns the new encrypted file path and the generated password.
    """
    password = generate_password()
    key = get_key_from_password(password)
    f = Fernet(key)
    
    with open(filepath, 'rb') as file:
        original_data = file.read()
        
    encrypted_data = f.encrypt(original_data)
    
    encrypted_filename = f"encrypted_{filename}"
    encrypted_filepath = os.path.join(Config.ENCRYPTED_FOLDER, encrypted_filename)
    
    with open(encrypted_filepath, 'wb') as file:
        file.write(encrypted_data)
        
    return encrypted_filename, password
