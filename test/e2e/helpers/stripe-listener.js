// Starts the Stripe CLI webhook listener so the server receives payment events
// during a donation e2e test. Forwards both ordinary and Connect events.
//
// Requires the `stripe` CLI to be installed and authenticated. Returns the
// spawned child process; pass it to stopStripeListener() in afterAll.
import { spawn } from 'child_process';

export function startStripeListener() {
  const proc = spawn('stripe', [
    'listen',
    '--forward-to',         'https://home.ergatas.org/api/stripe',
    '--forward-connect-to', 'https://home.ergatas.org/api/stripe-connect',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('stripe listener timed out waiting for ready signal (20s)')),
      20000,
    );

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(
        err.code === 'ENOENT'
          ? new Error('stripe CLI not found — install it from https://stripe.com/docs/stripe-cli')
          : err,
      );
    });

    const onData = (chunk) => {
      const line = chunk.toString();
      process.stdout.write('[stripe] ' + line);
      if (line.includes('Ready!') || /ready/i.test(line)) {
        clearTimeout(timer);
        resolve(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (code) reject(new Error(`stripe listener exited early with code ${code}`));
    });
  });
}

export function stopStripeListener(proc) {
  if (proc) proc.kill('SIGTERM');
}
