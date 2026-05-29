def find_mismatch(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    balance = 0
    for i, line in enumerate(lines):
        # Ignore comments
        line = line.split('//')[0]
        
        opens = line.count('<div')
        closes = line.count('</div>')
        
        balance += opens
        balance -= closes
        
        if balance < 0:
            print(f"Error: Balance negative at line {i+1}: {balance}")
            return
    
    print(f"Final balance: {balance}")

if __name__ == "__main__":
    find_mismatch(r"./src/app/admin/employees/detail/page.tsx")
