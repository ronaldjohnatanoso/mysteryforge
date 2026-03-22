#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function synthesizeKokoro(text, outputPath, opts = {}) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const voice = opts.voice || 'af_sky';
  const speed = opts.speed || 0.85;
  
  const tempText = `/tmp/kokoro_text_${Date.now()}.txt`;
  fs.writeFileSync(tempText, text);
  
  const script = `
from kokoro import KPipeline
import soundfile as sf
import numpy as np

text = open('${tempText}').read()
pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')

segments = list(pipeline(text, voice='${voice}', speed=${speed}))
all_audio = np.concatenate([s[2] for s in segments])
sf.write('${outputPath.replace('.mp3', '.wav')}', all_audio, 24000)
print(f'Duration: {len(all_audio)/24000:.1f}s')
`;

  const scriptPath = `/tmp/kokoro_script_${Date.now()}.py`;
  fs.writeFileSync(scriptPath, script);
  
  return new Promise((resolve, reject) => {
    exec(`python3 ${scriptPath} 2>/dev/null`, { timeout: 600000 }, (err, stdout, stderr) => {
      fs.unlinkSync(tempText);
      fs.unlinkSync(scriptPath);
      
      if (err) {
        reject(new Error(`Kokoro failed: ${stderr || err.message}`));
        return;
      }
      
      const wavPath = outputPath.replace('.mp3', '.wav');
      exec(`~/.local/bin/ffmpeg -y -i "${wavPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}" 2>/dev/null`, (err2) => {
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
        if (err2) reject(new Error('MP3 conversion failed'));
        else resolve({ path: outputPath, size: fs.statSync(outputPath).size, voice, speed });
      });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  let input = args.find(a => a.endsWith('.txt') || a.endsWith('.md'));
  
  const voice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : 'af_sky';
  const speed = args.includes('--speed') ? parseFloat(args[args.indexOf('--speed') + 1]) : 0.85;
  
  if (!input) {
    const outputDir = path.join(process.cwd(), 'output');
    const folders = fs.readdirSync(outputDir)
      .filter(f => fs.statSync(path.join(outputDir, f)).isDirectory())
      .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (folders.length === 0) {
      console.error('No story folders found.');
      process.exit(1);
    }
    input = path.join(outputDir, folders[0].name, 'narration.txt');
  }

  console.log(`\n🎙️ Synthesizing: ${input}`);
  console.log(`   Voice: ${voice}, Speed: ${speed}`);
  
  const text = fs.readFileSync(input, 'utf8');
  const output = input.replace(/\.(txt|md)$/, '.mp3');
  
  const result = await synthesizeKokoro(text, output, { voice, speed });
  console.log(`\n✅ Audio saved: ${result.path}\n`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });

module.exports = { synthesizeKokoro };