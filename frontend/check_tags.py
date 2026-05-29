import re

def check_jsx_balance(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    stack = []
    for i, line in enumerate(lines):
        # Very simple regex to find tags
        # This is not perfect for JSX but might help
        tags = re.findall(r'<(/?\w+)', line)
        for tag in tags:
            if tag.startswith('/'):
                tag_name = tag[1:]
                if not stack:
                    print(f"Error: Found </{tag_name}> on line {i+1} but stack is empty")
                else:
                    top = stack.pop()
                    if top != tag_name:
                        print(f"Error: Found </{tag_name}> on line {i+1} but expected </{top}>")
            else:
                # Ignore self-closing tags (very roughly)
                if not line.strip().endswith('/>'):
                    stack.append(tag)
    
    if stack:
        print(f"Error: Unclosed tags remaining: {stack}")

if __name__ == "__main__":
    check_jsx_balance(r"./src/app/admin/employees/detail/page.tsx")
