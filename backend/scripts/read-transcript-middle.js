import fs from 'fs';

const logPath = 'C:\\Users\\yusuf\\.gemini\\antigravity\\brain\\a9f16010-4282-474c-b039-dbf8e788ae5f\\.system_generated\\logs\\transcript.jsonl';

const run = () => {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const step = JSON.parse(line);
      if (step.step_index >= 32 && step.step_index <= 200) {
        if (step.type === 'USER_INPUT') {
          console.log(`\n[Step ${step.step_index}] USER INPUT (${step.created_at}):`);
          console.log(step.content);
        } else if (step.type === 'PLANNER_RESPONSE') {
          console.log(`\n[Step ${step.step_index}] PLANNER RESPONSE:`);
          console.log(step.content ? step.content.substring(0, 1000) + '...' : 'No content');
        }
      }
    } catch (e) {
      // Ignore
    }
  }
};

run();
