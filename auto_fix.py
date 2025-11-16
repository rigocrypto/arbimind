#!/usr/bin/env python3
"""
Auto-fix script for common TypeScript errors in ArbiMind
Fixes: process.env access, index signature brackets, null checks
"""

import re
import os
from pathlib import Path

def fix_env_access(content):
    """Fix process.env.VAR_NAME to process.env['VAR_NAME']"""
    # Pattern: process.env.IDENTIFIER (but not already in brackets)
    # Negative lookbehind to avoid matching already fixed instances
    pattern = r"process\.env\.([A-Z_][A-Z0-9_]*)"
    replacement = r"process.env['\1']"
    
    # Check if it's already fixed
    content = re.sub(pattern, replacement, content)
    return content

def fix_index_signatures(content):
    """Fix features.price_delta to features['price_delta']"""
    # Pattern: word.snake_case_word (index signature access)
    # This is more conservative to avoid false positives
    patterns = [
        (r"features\.([a-z_]+)", r"features['\1']"),
    ]
    
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)
    
    return content

def add_null_coalescing_to_features(content):
    """Add || 0 to feature access"""
    # Pattern: features['snake_case'] without || operator
    pattern = r"features\['([^']+)'\](?!\s*\|)"
    
    # Check context - only add if not already followed by || or ?
    lines = content.split('\n')
    result_lines = []
    
    for line in lines:
        # Match features access without operators
        if "features['" in line and not ('||' in line or '?' in line or ' = {' in line):
            line = re.sub(r"features\['([^']+)'\](?!\s*[\|\?])", r"features['\1'] || 0", line)
        result_lines.append(line)
    
    return '\n'.join(result_lines)

def process_file(filepath):
    """Process a single TypeScript file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        
        # Apply fixes
        content = fix_env_access(content)
        content = fix_index_signatures(content)
        content = add_null_coalescing_to_features(content)
        
        # Write back if changed
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return True, "Fixed"
        else:
            return False, "No changes"
    
    except Exception as e:
        return False, f"Error: {str(e)}"

def main():
    """Main entry point"""
    bot_src = Path(r"c:\Users\servi\RigoCrypto\ArbiMind\packages\bot\src")
    
    # Files to process
    files_to_fix = [
        "ai/AIOrchestrator.ts",
        "ai/models/SimpleOpportunityModel.ts",
        "ai/models/OpportunityDetectionModel.ts",
        "services/PriceService.ts",
        "services/ExecutionService.ts",
        "services/ArbitrageBot.ts",
        "middleware/rateLimiter.ts",
    ]
    
    print("🔧 Starting ArbiMind TypeScript Auto-Fix\n")
    print("=" * 60)
    
    for file_rel in files_to_fix:
        filepath = bot_src / file_rel
        
        if not filepath.exists():
            print(f"⏭️  SKIP: {file_rel} (not found)")
            continue
        
        changed, status = process_file(filepath)
        symbol = "✅" if changed else "⏭️ "
        print(f"{symbol} {file_rel:40} - {status}")
    
    print("=" * 60)
    print("\n✨ Auto-fix complete!")
    print("\nNext steps:")
    print("1. Review the changes:")
    print("   npm run typecheck --workspace=@arbimind/bot")
    print("\n2. Run build:")
    print("   npm run build --workspace=@arbimind/bot")
    print("\n3. If issues remain, review QUICK_FIX_GUIDE.md")

if __name__ == "__main__":
    main()
