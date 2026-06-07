import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // 1. 获取原始数据
  console.log('Fetching digest data...');
  let rawData;
  try {
    rawData = execSync('node prepare-digest.js', {
      cwd: __dirname,
      encoding: 'utf-8',
      timeout: 60000
    });
  } catch (err) {
    console.error('prepare-digest.js failed:', err.message);
    process.exit(1);
  }

  // 2. 读取 prompts
  console.log('Reading prompts...');
  const promptsDir = join(__dirname, '..', 'prompts');
  const digestIntro = readFileSync(join(promptsDir, 'digest-intro.md'), 'utf-8');
  const summarizeTweets = readFileSync(join(promptsDir, 'summarize-tweets.md'), 'utf-8');
  const summarizePodcast = readFileSync(join(promptsDir, 'summarize-podcast.md'), 'utf-8');
  const summarizeBlogs = readFileSync(join(promptsDir, 'summarize-blogs.md'), 'utf-8');
  const translate = readFileSync(join(promptsDir, 'translate.md'), 'utf-8');

  const systemPrompt = [
    digestIntro,
    '---',
    summarizeTweets,
    '---',
    summarizePodcast,
    '---',
    summarizeBlogs,
    '---',
    translate
  ].join('\n\n');

  // 3. 调用 Kimi API 生成摘要
  console.log('Generating digest with Kimi...');
  const apiResponse = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'moonshot-v1-32k',
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is today's raw data. Please generate the digest in bilingual format (Chinese + English):\n\n${rawData}` }
      ]
    })
  });

  if (!apiResponse.ok) {
    const err = await apiResponse.text();
    console.error('Kimi API error:', err);
    process.exit(1);
  }

  const result = await apiResponse.json();
  const digest = result.choices[0].message.content;
  console.log('Digest generated, length:', digest.length);

  // 4. 通过 Resend 发送邮件
  console.log('Sending email via Resend...');
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: 'AI Builders Digest <digest@resend.dev>',
      to: ['leahhuang0102@gmail.com'],
      subject: `AI Builders Digest — ${new Date().toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
      })}`,
      text: digest
    })
  });

  if (!emailResponse.ok) {
    const err = await emailResponse.json();
    console.error('Resend error:', JSON.stringify(err));
    process.exit(1);
  }

  console.log('✅ Digest sent successfully to leahhuang0102@gmail.com');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
