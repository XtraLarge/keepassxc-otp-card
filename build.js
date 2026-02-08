#!/usr/bin/env node

/**
 * Cross-platform build script for KeePassXC OTP Card
 * Combines editor and main card files into distribution file
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

const editorFile = path.join(srcDir, 'keepassxc-otp-card-editor.js');
const cardFile = path.join(srcDir, 'keepassxc-otp-card.js');
const outputFile = path.join(distDir, 'keepassxc-otp-card.js');

try {
  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Read source files
  const editorContent = fs.readFileSync(editorFile, 'utf8');
  const cardContent = fs.readFileSync(cardFile, 'utf8');

  // Combine files
  const combinedContent = editorContent + '\n' + cardContent;

  // Write output
  fs.writeFileSync(outputFile, combinedContent, 'utf8');

  console.log('✓ Build successful');
  console.log(`  - Combined ${editorFile}`);
  console.log(`  - Combined ${cardFile}`);
  console.log(`  - Output: ${outputFile}`);
} catch (error) {
  console.error('✗ Build failed:', error.message);
  process.exit(1);
}
