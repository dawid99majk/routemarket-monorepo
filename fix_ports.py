import re
import os

files = [
    '/root/openclaw/docker-compose.yml',
    '/root/hermes-stack/docker-compose.yml',
    '/root/swarm/docker-compose.yml',
    '/root/meeting-miner/docker-compose.yml'
]

for filepath in files:
    if not os.path.exists(filepath):
        print(f'Missing: {filepath}')
        continue
    
    with open(filepath, 'r') as f:
        content = f.read()
    
    # regex to find port bindings that don't have an IP
    # e.g. - "8080:8080" or - 8080:8080
    def repl(m):
        full = m.group(0)
        inner = m.group(1)
        if '127.0.0.1' in full:
            return full
        return full.replace(inner, f'127.0.0.1:{inner}')
        
    new_content = re.sub(r'-\s*[\'"]?(\d+:\d+)[\'"]?', repl, content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f'Fixed {filepath}')
    else:
        print(f'No changes for {filepath}')
