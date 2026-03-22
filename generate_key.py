from cryptography.fernet import Fernet
print('KEY=' + Fernet.generate_key().decode())
