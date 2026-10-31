// Serves the static site and handles the contact form (POST /api/contact).
// Needs: send_email binding EMAIL, var CONTACT_TO (a verified Email Routing destination), secret TURNSTILE_SECRET.

const FROM = { email: 'contact@brightpath-solutions.online', name: 'BrightPath website' };
const TOPICS = { school: 'School inquiry', parent: 'Parent question', other: 'Other' };
const LIMITS = { name: 100, email: 254, school: 150, message: 5000 };

const json = (status, body) => Response.json(body, { status });
// Header-bound fields must never contain line breaks (header injection).
const oneLine = (s) => s.replace(/[\r\n]+/g, ' ').trim();

async function turnstileOk(token, ip, secret) {
  if (!token || token.length > 2048) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip ?? '' }),
      signal: AbortSignal.timeout(10_000),
    });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
}

export async function handleContact(request, env) {
  if (!env.EMAIL || !env.CONTACT_TO || !env.TURNSTILE_SECRET) {
    console.error('contact form is not configured (EMAIL, CONTACT_TO or TURNSTILE_SECRET missing)');
    return json(500, { ok: false, error: 'The form is not available right now. Please email us instead.' });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: 'Invalid form data.' });
  }
  const field = (k) => String(form.get(k) ?? '').trim();
  const name = oneLine(field('name'));
  const email = oneLine(field('email'));
  const school = oneLine(field('school'));
  const message = field('message');
  const topic = TOPICS[field('topic')] ?? TOPICS.other;

  if (!name || !email || !message) return json(400, { ok: false, error: 'Please fill in your name, email and message.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: 'Please enter a valid email address.' });
  for (const [k, v] of Object.entries({ name, email, school, message })) {
    if (v.length > LIMITS[k]) return json(400, { ok: false, error: `Your ${k} is too long.` });
  }

  if (!(await turnstileOk(field('cf-turnstile-response'), request.headers.get('CF-Connecting-IP'), env.TURNSTILE_SECRET))) {
    return json(403, { ok: false, error: 'The spam check failed. Please refresh the page and try again.' });
  }

  try {
    await env.EMAIL.send({
      from: FROM,
      to: env.CONTACT_TO,
      replyTo: { email, name },
      subject: `${topic} from ${name}${school ? ` (${school})` : ''}`,
      text: `${topic} sent from brightpath-solutions.online\n\nName: ${name}\nEmail: ${email}\nSchool: ${school || '-'}\n\n${message}\n\n(Reply to this email to answer ${name} directly.)`,
    });
  } catch (e) {
    console.error('contact email failed', e.code, e.message);
    return json(502, { ok: false, error: 'Your message could not be sent. Please try again or email us.' });
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/contact') {
      return request.method === 'POST' ? handleContact(request, env) : json(405, { ok: false, error: 'Method not allowed.' });
    }
    return env.ASSETS.fetch(request);
  },
};
