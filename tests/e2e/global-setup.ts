import { execSync } from 'node:child_process';

// Build once per run so the server serves the current dist/.
export default function globalSetup(): void {
  execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
}
