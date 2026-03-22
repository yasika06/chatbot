import re

# Regex patterns for various sensitive data
PATTERNS = {
    'credit_card': re.compile(r'\b(?:\d{4}[\-\s]?){3}\d{4}\b'), # 16 digits
    'aadhaar': re.compile(r'\b\d{4}[\-\s]?\d{4}[\-\s]?\d{4}\b'), # 12 digits
    'phone': re.compile(r'\b(?:\+?\d{1,3}[\-\s]?)?\d{10}\b'), # exactly 10 digits for base number
    'email': re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b'),
    'password': re.compile(r'(?i)(password|pwd|passcode)[\s:=]+([^\s,;]+)'),
    'api_key': re.compile(r'(?i)(api[_-]?key|secret|token)[\s:=]+([a-zA-Z0-9_\-]{20,})')
}

def detect_and_mask(text, mode='partial'):
    return preprocess_and_mask(text, mode)

def scan_and_mask(text, mode='partial'):
    return preprocess_and_mask(text, mode)

def preprocess_and_mask(text, mode='partial'):
    """
    Scans the text for PII/sensitive info.
    Returns:
    - masked_text (str)
    - findings (dict): mapping of category to list of findings
    - risk_score (str): 'Low', 'Medium', 'High'
    """
    if not text:
         return text, {}, "Low"
         
    findings = {key: [] for key in PATTERNS.keys()}
    masked_text = text
    total_findings = 0
    
    # Process each pattern
    for category, pattern in PATTERNS.items():
        matches = pattern.finditer(masked_text) # search over masked_text sequentially to avoid double finding
        for match in matches:
            original = match.group(0)
            if original not in findings[category]: # don't count same text multiple times per category
                findings[category].append(original)
                total_findings += 1
            
            # Masking logic
            if category == 'phone':
                digits = re.sub(r'\D', '', original)
                if mode == 'strict':
                    masked = re.sub(r'\d', 'X', original)
                elif len(digits) >= 3:
                    mask_count = len(digits) - 3
                    def repl(m):
                        nonlocal mask_count
                        if mask_count > 0:
                            mask_count -= 1
                            return 'X'
                        return m.group(0)
                    masked = re.sub(r'\d', repl, original)
                else:
                    masked = "[REDACTED]"
            elif category in ['aadhaar', 'credit_card']:
                digits = re.sub(r'\D', '', original)
                if mode == 'strict':
                    masked = re.sub(r'\d', 'X', original)
                elif len(digits) >= 4:
                    mask_count = len(digits) - 4
                    def repl(m):
                        nonlocal mask_count
                        if mask_count > 0:
                            mask_count -= 1
                            return 'X'
                        return m.group(0)
                    masked = re.sub(r'\d', repl, original)
                else:
                    masked = "[REDACTED]"
            elif category == 'email':
                if mode == 'strict':
                    masked = 'XXXXXXXXXX'
                else:
                    parts = original.split('@')
                    local_part = parts[0]
                    masked_local = 'X' * len(local_part)
                    if len(masked_local) > 5:
                        masked_local = 'X' * 5
                    masked = f"{masked_local}@{parts[1]}"
            elif category in ['password', 'api_key']:
                secret = match.group(2)
                if len(secret) > 4:
                    masked_secret = '*' * (len(secret) - 4) + secret[-4:]
                else:
                    masked_secret = '****'
                masked = original.replace(secret, masked_secret)
            else:
                masked = "[SENSITIVE_DATA]"
                
            masked_text = masked_text.replace(original, masked)
            
    # Calculate risk score
    risk_score = "Low"
    if total_findings > 0:
        if total_findings >= 3 or len(findings['password']) > 0 or len(findings['api_key']) > 0 or len(findings['credit_card']) > 0:
            risk_score = "High"
        else:
            risk_score = "Medium"
            
    cleaned_findings = {k: v for k, v in findings.items() if v}
    return masked_text, cleaned_findings, risk_score
