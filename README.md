# AIPrivacyShield

AIPrivacyShield is a privacy-first web application and AI chatbot built with Flask. Its primary goal is to protect sensitive user data (such as emails, phone numbers, Aadhaar numbers, and credit card numbers) from being exposed or sent to third-party AI APIs like OpenAI or Gemini.

## Key Features

- **Automated Data Masking:** Intercepts sensitive data in user prompts and document uploads, replacing it with secure placeholders *before* hitting external APIs.
- **Privacy Mode Toggles:** Choose your level of masking between 'strict', 'partial', and 'none'.
- **Intelligent LLM Integrations:** Connects seamlessly to Google Gemini, OpenAI, or Groq API endpoints.
- **Secure File Processing:** Extracts and scans documents (PDF, DOCX, TXT) for Personally Identifiable Information (PII). If sensitive data is detected, the file is automatically encrypted!
- **Encrypted Local Storage:** Any files flagged with PII get locked and encrypted, protecting your data in case of directory exposure.
- **Private Chat History:** View your full chat history with sensitive data masked by default. Includes an optional master password system for viewing raw logs.
- **Analytics Dashboard:** Automatically track how many sensitive prompts have been blocked, how many files have been encrypted, and monitor your overall data safety risk score.

## Installation

1. Clone the repository to your local machine.
2. Navigate to the project directory:
   ```bash
   cd AIPrivacyShield
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up your environment variables. Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   GOOGLE_API_KEY=your_google_api_key_here
   ```
   *(Note: You can also place a Groq API key in the `OPENAI_API_KEY` environment variable to use Groq's fast LLMs.)*

## Running the App

Start the Flask development server:
```bash
python app.py
```
Then open your web browser and navigate to `http://127.0.0.1:5000`.

## Tech Stack

- **Backend:** Python, Flask, SQLite
- **AI Integrations:** Google GenAI SDK, OpenAI Python SDK
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Security & Utilities:** Werkzeug Security (Password Hashing, Secure Filenames)

## License & Usage

This project was built for a Hackathon to demonstrate privacy-first architecture design with modern chatbots. It is designed as an experimental proof-of-concept for handling PII.
