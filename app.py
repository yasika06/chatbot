import os
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from config import Config
from database import init_db, update_stat, get_stats, save_chat, get_history, set_setting, get_setting, delete_history, toggle_lock
from security_scanner import scan_and_mask, preprocess_and_mask
from file_processor import extract_text_from_file, encrypt_file
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config.from_object(Config)

# Initialize Database
init_db()

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['ENCRYPTED_FOLDER'], exist_ok=True)

# Initialize AI client if key is available
client = None
client_type = None

openai_api_key = os.getenv('OPENAI_API_KEY') or app.config.get('OPENAI_API_KEY')
google_api_key = os.getenv('GOOGLE_API_KEY') or app.config.get('GOOGLE_API_KEY')

if google_api_key and google_api_key.startswith('AIza'):
    try:
        from google import genai
        client = genai.Client(api_key=google_api_key)
        client_type = 'gemini'
        print("OK: Google Gemini client initialized successfully!")
    except ImportError:
        print("[Warning] google-genai package not found")
    except Exception as e:
        print(f"[Warning] Gemini client not initialized ({e})")
        
elif openai_api_key and openai_api_key != 'sk-your-actual-api-key-goes-here':
    try:
        # Remove any proxy environment variables to avoid conflicts
        os.environ.pop('HTTP_PROXY', None)
        os.environ.pop('HTTPS_PROXY', None)
        os.environ.pop('http_proxy', None)
        os.environ.pop('https_proxy', None)
        
        # Detect if it's a Groq key
        base_url = None
        if openai_api_key.startswith('gsk_'):
            base_url = "https://api.groq.com/openai/v1"
            print("INFO: Groq key detected, using Groq API URL")
        
        client = OpenAI(api_key=openai_api_key, base_url=base_url)
        client_type = 'openai'
        print("OK: OpenAI AI client initialized successfully!")
        
    except Exception as e:
        print(f"[Warning] Warning: OpenAI client not initialized ({e})")
        client = None
else:
    print("[Warning] No valid API key found")

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')


@app.route('/history')
def history_page():
    return render_template('history.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    global client  # Make sure we can access the global client
    
    data = request.json or {}
    user_prompt = data.get('prompt', '')
    confirm = data.get('confirm', False)
    history_context = data.get('history', [])
    privacy_mode = data.get('privacy_mode', 'partial')
    
    if not user_prompt:
        return jsonify({"error": "Prompt is required"}), 400
        
    # Security Scan
    masked_prompt, findings, risk_score = preprocess_and_mask(user_prompt, mode=privacy_mode)
    update_stat('prompts_scanned')
    
    # If sensitive data detected and not confirmed by the client, return a warning
    if findings and not confirm:
        return jsonify({
            'warning': 'sensitive_detected',
            'findings': findings,
            'risk_score': risk_score,
            'masked_prompt': masked_prompt
        }), 400
    
    if findings:
        update_stat('sensitive_prompts_detected')
    
    # Try to get real AI response
    ai_response = None
    print(f"DEBUG: client is None? {client is None}")
    print(f"DEBUG: client type: {type(client)}")
    
    try:
        if client and client_type == 'gemini':
            active_model = "gemini-2.5-flash-lite"
            print(f"OK: Direct API call to Gemini ({active_model}) with history context...")
            
            contents = ["System: You are a helpful privacy-first AI assistant."]
            for msg in history_context:
                prefix = "User: " if msg.get('role') == "user" else "Assistant: "
                contents.append(prefix + str(msg.get('content', '')))
                
            contents.append("User: " + masked_prompt)
            prompt_text = "\n\n".join(contents)
            
            response = client.models.generate_content(
                model=active_model,
                contents=prompt_text
            )
            ai_response = response.text
            print(f"OK: Got Gemini AI response: {ai_response[:50]}...")
            
        elif client and client_type == 'openai':
            # Select model based on API provider
            active_model = "gpt-3.5-turbo"
            if openai_api_key and openai_api_key.startswith('gsk_'):
                active_model = "llama-3.1-8b-instant"
                
            print(f"OK: Direct API call to OpenAI/Groq ({active_model}) with history context...")
            
            messages = [{"role": "system", "content": "You are a helpful privacy-first AI assistant."}]
            for msg in history_context:
                role = "user" if msg.get('role') == "user" else "assistant"
                messages.append({"role": role, "content": msg.get('content', '')})
            messages.append({"role": "user", "content": masked_prompt})
            
            response = client.chat.completions.create(
                model=active_model,
                messages=messages,
                temperature=0.7
            )
            ai_response = response.choices[0].message.content
            print(f"OK: Got AI response: {ai_response[:50]}...")
        else:
            print("[Warning] Client is None - using mock response")
            ai_response = None
    except Exception as e:
        error_msg = str(e)
        print(f"Error: Error calling AI API: {error_msg}")
        
        # Check for specific error types
        if "insufficient_quota" in error_msg or "429" in error_msg:
            ai_response = "[Warning] OpenAI API quota exceeded. Please add credits to your OpenAI account at https://platform.openai.com/account/billing or create a new account for free credits."
        elif "invalid_api_key" in error_msg:
            ai_response = "Error: Invalid OpenAI API key. Please check your .env file."
        else:
            ai_response = f"Error: OpenAI API Error: {error_msg}"
    
    # Fallback to mock if no response
    if not ai_response:
        ai_response = "I am a mock response because the OpenAI API key is missing. I would have replied to: " + masked_prompt
            
    # record the interaction. We replace user_prompt with masked_prompt so no raw data is saved
    chat_id = save_chat(masked_prompt, masked_prompt, ai_response, sensitive=bool(findings))
    
    return jsonify({
        "id": chat_id,
        "original_prompt": user_prompt,
        "masked_prompt": masked_prompt,
        "findings": findings,
        "risk_score": risk_score,
        "response": ai_response
    })

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        update_stat('files_uploaded')
        
        # Process and scan
        extracted_text = extract_text_from_file(filepath)
        privacy_mode = request.form.get('privacy_mode', 'partial')
        masked_text, findings, risk_score = preprocess_and_mask(extracted_text, mode=privacy_mode)
        
        result = {
            "filename": filename,
            "status": "success",
            "findings": findings,
            "risk_score": risk_score,
            "encrypted": False
        }
        
        # Encrypt if sensitive data found
        if findings:
            encrypted_filename, password = encrypt_file(filepath, filename)
            update_stat('files_encrypted')
            result["encrypted"] = True
            result["encrypted_filename"] = encrypted_filename
            result["password"] = password
            result["warning"] = "Sensitive data detected! The file has been encrypted."
            
        return jsonify(result)
        
    return jsonify({"error": "File type not allowed"}), 400

@app.route('/api/mask', methods=['POST'])
def mask_text():
    data = request.json or {}
    text = data.get('text', '')
    mode = data.get('privacy_mode', 'partial')
    if not text:
        return jsonify({'masked_text': ''})
    masked_text, _, _ = preprocess_and_mask(text, mode=mode)
    return jsonify({'masked_text': masked_text})


@app.route('/api/stats', methods=['GET'])
def stats():
    return jsonify(get_stats())


# -----------------------------------------------------------------------------
# history endpoints
# -----------------------------------------------------------------------------

@app.route('/api/history', methods=['GET'])
def history():
    # optional password passed as query param or header
    password = request.args.get('password') or request.headers.get('X-History-Password')
    hashed = get_setting('history_password')
    include_sensitive = False
    if hashed and password and check_password_hash(hashed, password):
        include_sensitive = True
    # also include locked entries if password provided
    include_locked = bool(password)
    entries = get_history(include_sensitive=include_sensitive, include_locked=include_locked)
    return jsonify({
        'history': entries,
        'showing_sensitive': include_sensitive
    })


@app.route('/api/history/password', methods=['POST'])
def set_history_pwd():
    data = request.json or {}
    new_pwd = data.get('new_password')
    current = data.get('current_password')

    if not new_pwd:
        return jsonify({'error': 'new_password required'}), 400

    hashed = get_setting('history_password')
    # if a password already exists, require current
    if hashed:
        if not current or not check_password_hash(hashed, current):
            return jsonify({'error': 'current_password invalid'}), 403
    # store new password hash
    set_setting('history_password', generate_password_hash(new_pwd))
    return jsonify({'status': 'password set'})

@app.route('/api/history/delete', methods=['POST'])
def delete_history_entry():
    data = request.json or {}
    entry_id = data.get('id')
    # verify password if the history is locked
    hashed = get_setting('history_password')
    if hashed:
        password = data.get('password') or request.headers.get('X-History-Password')
        if not password or not check_password_hash(hashed, password):
            return jsonify({'error': 'password required or invalid'}), 403
    # perform deletion (None clears all)
    delete_history(entry_id)
    return jsonify({'status': 'ok', 'id': entry_id})

@app.route('/delete/<int:id>', methods=['DELETE', 'POST'])
def delete_chat_by_id(id):
    try:
        delete_history(id)
        return jsonify({'status': 'success', 'message': 'Entry deleted successfully', 'id': id})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400

@app.route('/api/history/lock', methods=['POST'])
def lock_history_entry():
    data = request.json or {}
    entry_id = data.get('id')
    lock = data.get('lock', True)
    if entry_id is None:
        return jsonify({'error': 'id required'}), 400
    toggle_lock(entry_id, lock)
    return jsonify({'status': 'ok', 'id': entry_id, 'locked': lock})

@app.route('/api/files/delete', methods=['POST'])
def delete_all_files():
    # Delete everything in UPLOAD_FOLDER and ENCRYPTED_FOLDER
    for folder_path in [app.config['UPLOAD_FOLDER'], app.config['ENCRYPTED_FOLDER']]:
        if os.path.exists(folder_path):
            for filename in os.listdir(folder_path):
                file_path = os.path.join(folder_path, filename)
                try:
                    if os.path.isfile(file_path):
                        os.unlink(file_path)
                except Exception as e:
                    print(f"Failed to delete {file_path}. Reason: {e}")
    return jsonify({"status": "success"})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
