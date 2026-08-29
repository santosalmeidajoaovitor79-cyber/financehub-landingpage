import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGIN = process.env.SITE_URL || '*';
const BUCKET = 'produtos-pagos';
const EXPIRA_EM_SEGUNDOS = 300; // 5 minutos

// Cada produto mapeia pro caminho PT/EN dentro do bucket privado. A versão
// servida depende de como o cliente pagou: Mercado Pago (pix/card) -> PT,
// Stripe -> EN — é o mesmo sinal que já usamos pra decidir idioma no site.
const CATALOGO = {
    financehub: {
        pt: 'financehub-pro-essential-pt.xlsx',
        en: 'financehub-pro-essential-en.xlsx',
    },
};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas na Vercel.');
        return res.status(500).json({ erro: 'Erro de configuração do servidor.' });
    }

    const { produto } = req.query;
    const arquivos = CATALOGO[produto];
    if (!arquivos) {
        return res.status(404).json({ erro: 'Produto desconhecido.' });
    }

    const authHeader = req.headers.authorization || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) {
        return res.status(401).json({ erro: 'Não autenticado.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData?.user) {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('pago, forma_pagamento')
        .eq('id', userData.user.id)
        .maybeSingle();

    if (perfilError || !perfil?.pago) {
        return res.status(403).json({ erro: 'Você ainda não tem acesso a esse produto.' });
    }

    const idioma = perfil.forma_pagamento === 'stripe' ? 'en' : 'pt';
    const caminhoArquivo = arquivos[idioma];

    const { data: signedData, error: signedError } = await supabase
        .storage
        .from(BUCKET)
        .createSignedUrl(caminhoArquivo, EXPIRA_EM_SEGUNDOS);

    if (signedError || !signedData?.signedUrl) {
        console.error('Erro ao gerar signed URL:', signedError?.message);
        return res.status(500).json({ erro: 'Não foi possível gerar o link de download. Tente novamente em instantes.' });
    }

    return res.status(200).json({ url: signedData.signedUrl, expiraEm: EXPIRA_EM_SEGUNDOS });
}
