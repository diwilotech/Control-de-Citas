-- PIN para volver a entrar a "mis citas" con solo el celular (si se perdió el link original) —
-- mismo mecanismo que confirmar una cita: el cliente manda el PIN por su propio WhatsApp.
ALTER TABLE clients ADD COLUMN login_pin TEXT;
ALTER TABLE clients ADD COLUMN login_pin_expires_at TEXT;
