import requests

# basic request
r = requests.post('http://127.0.0.1:5000/api/chat', json={'prompt':'hello'})
print('status', r.status_code)
print(r.text)

# sensitive prompt test
prompt = 'my email is test@example.com'
r = requests.post('http://127.0.0.1:5000/api/chat', json={'prompt': prompt})
print('sensitive check status', r.status_code)
print(r.text)

# confirm the sensitive prompt
r = requests.post('http://127.0.0.1:5000/api/chat', json={'prompt': prompt, 'confirm': True})
print('confirmed status', r.status_code)
print(r.text)
