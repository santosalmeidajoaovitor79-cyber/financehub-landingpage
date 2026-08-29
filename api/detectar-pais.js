// checkout.html é um arquivo estático, então não consegue ler headers de request
// diretamente. Essa rota existe só pra expor o header x-vercel-ip-country (que a
// Vercel já injeta automaticamente em toda invocação de função) pro navegador.
export default function handler(req, res) {
    const pais = req.headers['x-vercel-ip-country'] || null;
    return res.status(200).json({ pais });
}
