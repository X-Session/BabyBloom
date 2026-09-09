require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const Replicate = require('replicate');

const prompt = 'Photorealistic warm maternity and family photoshoot, a happy pregnant woman and her partner gently embracing and touching her belly, soft golden hour natural light, cozy neutral tones, professional studio photography, tender and joyful mood, no text';

function outputUrl(output) {
  const firstOutput = Array.isArray(output) ? output[0] : output;
  if (typeof firstOutput === 'string') return firstOutput;
  if (firstOutput && typeof firstOutput.url === 'function') return String(firstOutput.url());
  if (firstOutput && firstOutput.url) return String(firstOutput.url);
  return null;
}

async function main() {
  if (!process.env.REPLICATE_API_TOKEN || !process.env.REPLICATE_MODEL) {
    throw new Error('REPLICATE_API_TOKEN and REPLICATE_MODEL are required in .env');
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const outputDirectory = path.join(__dirname, '..', 'images');
  await fs.mkdir(outputDirectory, { recursive: true });

  const output = await replicate.run(process.env.REPLICATE_MODEL, {
    input: { prompt, aspect_ratio: '4:5' },
  });
  const imageUrl = outputUrl(output);
  if (!imageUrl) throw new Error('No image returned for future-family section');

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error('Could not download future-family image');
  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(path.join(outputDirectory, 'future-family.jpg'), imageBytes);
  console.log('Saved images/future-family.jpg');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
