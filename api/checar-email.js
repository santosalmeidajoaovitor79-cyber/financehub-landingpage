import { promises as dns } from 'node:dns';

// Checagem leve e grátis: confere se o domínio do e-mail tem registro MX
// (ou seja, existe e está configurado pra receber e-mail). Não confirma que
// a caixa de entrada específica é real — só pega domínio inexistente/digitado
// errado (ex: "gmial.com"). Não bloqueia o cliente, é só um aviso visual.
const ALLOWED_ORIGIN = process.env.SITE_URL || '*';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    const email = String(req.query.email || '').trim();
    const partes = email.split('@');
    if (partes.length !== 2 || !partes[1]) {
        return res.status(200).json({ valido: false, motivo: 'formato' });
    }

    const dominio = partes[1].toLowerCase();

    try {
        const registros = await dns.resolveMx(dominio);
        return res.status(200).json({ valido: registros.length > 0 });
    } catch (err) {
        // ENOTFOUND/ENODATA: domínio não existe ou não tem servidor de e-mail configurado.
        return res.status(200).json({ valido: false, motivo: 'dominio' });
    }
}
