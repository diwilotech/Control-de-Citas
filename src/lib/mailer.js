import { WorkerMailer } from "worker-mailer";

// Envía correo por SMTP usando el Gmail del propio negocio (usuario + contraseña de aplicación,
// configurados en Ajustes). Misma forma que sendWhatsApp ({ok, error}) para que confirm.js pueda
// tratar los dos canales igual. Si Gmail llega a bloquear el login SMTP desde un datacenter (pasa
// a veces aunque la contraseña de aplicación sea correcta), este es el único archivo que habría
// que tocar para cambiar de proveedor.
export async function sendEmail(env, business, to, subject, text) {
  const user = business.gmail_user;
  const pass = business.gmail_app_password;
  if (!user || !pass) {
    return { ok: false, error: "Correo no configurado (falta el Gmail o la contraseña de aplicación en Ajustes)." };
  }
  if (!to) return { ok: false, error: "El cliente no dejó correo." };

  try {
    await WorkerMailer.send(
      {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        startTls: true,
        credentials: { username: user, password: pass },
        authType: "plain",
      },
      { from: { name: business.name, email: user }, to, subject, text },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
