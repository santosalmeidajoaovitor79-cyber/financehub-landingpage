import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGIN = process.env.SITE_URL || '*';
const LIMITE_DIARIO = 20;
const MODELO_GROQ = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `Você analisa a estrutura de planilhas e devolve APENAS um JSON válido (sem markdown, sem texto fora do JSON), no formato:
{
  "legivel": true ou false,
  "motivo": "string, obrigatório só se legivel=false",
  "tipo_planilha": "nome curto do tipo, ex: Vendas, Financeiro, Estoque, RH, Genérica",
  "resumo": "1 frase curta descrevendo o que foi encontrado",
  "metricas": [{"titulo":"string","coluna":"nome exato da coluna ou null","agregacao":"sum|count|average|count_distinct","formato":"moeda|numero|percentual"}],
  "graficos": [{"tipo":"bar|line|pie","titulo":"string","coluna_categoria":"nome exato","coluna_valor":"nome exato","agregacao":"sum|count|average","agrupar_por_mes":true|false}]
}
Regras: use APENAS nomes de coluna da lista enviada, exatamente como escritos. Máx. 4 métricas e 3 gráficos. Se não parecer uma tabela analisável, retorne legivel=false com motivo claro. Nunca invente colunas.`;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.GROQ_API_KEY) {
        console.error('Variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GROQ_API_KEY não configuradas na Vercel.');
        return res.status(500).json({ erro: 'Erro de configuração do servidor.' });
    }

    // Autenticação: o front manda o access_token da sessão Supabase no header.
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
    const usuarioId = userData.user.id;

    // Recurso é grátis pra quem já comprou o FinanceHub PRO — checa o mesmo campo
    // "pago" usado em meus-produtos.html, direto no servidor (o front também checa,
    // mas isso aqui é o que realmente impede a chamada cara à IA).
    const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('pago')
        .eq('id', usuarioId)
        .maybeSingle();

    if (perfilError || !perfil?.pago) {
        return res.status(403).json({ erro: 'Recurso disponível apenas para quem já comprou o FinanceHub PRO.' });
    }

    // Rate limit diário: conta quantas análises esse usuário já fez desde meia-noite.
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);

    const { count, error: countError } = await supabase
        .from('analises_ia')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId)
        .gte('criado_em', inicioDoDia.toISOString());

    if (countError) {
        console.error('Erro ao checar limite diário:', countError.message);
        return res.status(500).json({ erro: 'Erro ao checar limite de uso.' });
    }
    if ((count || 0) >= LIMITE_DIARIO) {
        return res.status(429).json({ erro: `Limite diário de ${LIMITE_DIARIO} análises atingido. Tente novamente amanhã.` });
    }

    const { nomeArquivo, abaAnalisada, totalLinhas, colunas } = req.body || {};
    if (!Array.isArray(colunas) || colunas.length === 0) {
        return res.status(400).json({ erro: 'Nenhuma coluna enviada.' });
    }

    // Nunca confiar no tamanho enviado pelo cliente: trunca tudo de novo aqui.
    const colunasSeguras = colunas.slice(0, 25).map(c => ({
        nome: String(c?.nome ?? '').slice(0, 200),
        tipo: String(c?.tipo ?? '').slice(0, 200),
        exemplos: Array.isArray(c?.exemplos) ? c.exemplos.slice(0, 3).map(e => String(e).slice(0, 200)) : [],
    }));

    const userPrompt = `Arquivo: ${String(nomeArquivo ?? '').slice(0, 200)}
Aba: ${String(abaAnalisada ?? '').slice(0, 200)}
Linhas: ${Number(totalLinhas) || 0}
Colunas:
${colunasSeguras.map(c => `- ${c.nome} (${c.tipo}): ${c.exemplos.join(' | ')}`).join('\n')}`;

    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: MODELO_GROQ,
                max_tokens: 800,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt },
                ],
            }),
        });

        if (!resp.ok) {
            // Só logamos status + corpo de erro da Groq, nunca os dados da planilha do cliente.
            console.error('Erro da API da Groq:', resp.status, await resp.text());
            return res.status(502).json({ erro: 'Falha ao consultar a IA. Tente novamente.' });
        }

        const data = await resp.json();
        const texto = data?.choices?.[0]?.message?.content || '';
        const limpo = texto.replace(/```json|```/g, '').trim();

        let plano;
        try {
            plano = JSON.parse(limpo);
        } catch (parseErr) {
            console.error('Resposta da IA não é JSON válido.');
            return res.status(502).json({ erro: 'A IA devolveu uma resposta inesperada. Tente novamente.' });
        }

        // Defesa extra: descarta métricas/gráficos que citem coluna fora da lista enviada,
        // caso a IA "invente" alguma mesmo com a instrução contra isso no prompt.
        const nomesValidos = new Set(colunasSeguras.map(c => c.nome));
        const colunaValida = (nome) => nome === null || nome === undefined || nomesValidos.has(nome);

        if (Array.isArray(plano.metricas)) {
            plano.metricas = plano.metricas.filter(m => colunaValida(m?.coluna)).slice(0, 4);
        }
        if (Array.isArray(plano.graficos)) {
            plano.graficos = plano.graficos
                .filter(g => colunaValida(g?.coluna_categoria) && colunaValida(g?.coluna_valor))
                .slice(0, 3);
        }

        // Registra o uso pro rate limit — só nome do arquivo, nunca o conteúdo.
        await supabase.from('analises_ia').insert([{
            usuario_id: usuarioId,
            nome_arquivo: String(nomeArquivo ?? '').slice(0, 200),
        }]);

        return res.status(200).json(plano);

    } catch (err) {
        console.error('Erro ao analisar planilha:', err.message);
        return res.status(500).json({ erro: 'Falha ao analisar a planilha.' });
    }
}
