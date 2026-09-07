require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const Replicate = require('replicate');

const prompts = [
  'Photorealistic close-up portrait of a happy 6 to 12 month old baby girl, face filling the square frame, wearing a soft pink outfit and a large pale pink bow headband, warm peach pastel studio background, bright joyful smile, professional baby photography, soft natural light, no adults, no text',
  'Photorealistic close-up portrait of a happy 6 to 12 month old baby with thick dark curly hair, face filling the square frame, lying on a cream blanket in a soft peach outfit, warm pastel studio background, bright joyful smile, professional baby photography, no adults, no text',
  'Photorealistic close-up portrait of a happy 6 to 12 month old baby wearing a white fluffy hooded outfit with small bear ears, face filling the square frame, soft cream and pale beige background, bright joyful smile, professional baby photography, no adults, no text',
  'Photorealistic close-up portrait of a happy 6 to 12 month old baby in a cream knitted outfit, face filling the square frame, warm beige pastel background, bright joyful smile, professional baby photography, soft natural light, no adults, no text'
];

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

  for (const [index, prompt] of prompts.entries()) {
    const output = await replicate.run(process.env.REPLICATE_MODEL, {
      input: { prompt, aspect_ratio: '1:1' },
    });
    const imageUrl = outputUrl(output);
    if (!imageUrl) throw new Error(`No image returned for gallery image ${index + 1}`);

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`Could not download gallery image ${index + 1}`);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    await fs.writeFile(path.join(outputDirectory, `generated-baby-${index + 1}.jpg`), imageBytes);
    console.log(`Saved gallery image ${index + 1}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});