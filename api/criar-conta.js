import { createClient } from '@supabase/supabase-js';
import { obterProduto } from '../lib/produtos.js';

// Troque '*' pelo domínio real do seu site (ex: 'https://seudominio.com')
// ou defina a variável de ambiente SITE_URL na Vercel.
const ALLOWED_ORIGIN = process.env.SITE_URL || '*';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Método não permitido' });
    }

    const { nome, cpf, email, password, metodo, produto } = req.body || {};

    const config = obterProduto(produto || 'financehub');
    if (!config) {
        return res.status(400).json({ success: false, error: 'Produto inválido.' });
    }

    // Validação básica no servidor (o front pode ser burlado, o servidor não pode confiar nele)
    if (!nome || !email || !password) {
        return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
    }
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ success: false, error: 'E-mail inválido.' });
    }
    if (String(password).length < 8) {
        return res.status(400).json({ success: false, error: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    // CPF/CNPJ só existe pro fluxo brasileiro (Mercado Pago). Clientes internacionais
    // pagando via Stripe não têm CPF, então esse campo fica nulo pra eles.
    const ehInternacional = metodo === 'stripe';
    let cpfLimpo = null;
    if (!ehInternacional) {
        if (!cpf) {
            return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
        }
        cpfLimpo = String(cpf).replace(/\D/g, '');
        if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
            return res.status(400).json({ success: false, error: 'CPF/CNPJ inválido.' });
        }
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Variáveis SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas na Vercel.');
        return res.status(500).json({ success: false, error: 'Erro de configuração do servidor. Tente novamente mais tarde.' });
    }

    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });

        if (authError) {
            // E-mail já cadastrado: em vez de travar o cliente numa tentativa anterior
            // que falhou no pagamento, deixamos ele retomar a compra pendente.
            const jaExiste = authError.status === 422 || /already been registered/i.test(authError.message || '');
            if (jaExiste) {
                // Conta já existe (pode ter comprado o outro produto antes) — reaproveita
                // o mesmo id em vez de bloquear, a não ser que ESTE produto específico
                // já esteja pago.
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select(`id, ${config.campoPago}`)
                    .eq('email', email)
                    .maybeSingle();

                if (existingProfile?.[config.campoPago]) {
                    return res.status(409).json({
                        success: false,
                        error: 'Este e-mail já possui uma compra aprovada deste produto. Faça login em vez de comprar de novo.'
                    });
                }
                if (existingProfile) {
                    return res.status(200).json({
                        success: true,
                        userId: existingProfile.id,
                        message: 'Retomando compra pendente.'
                    });
                }

                // Existe no Auth mas não tem linha em profiles (ex: dado apagado direto
                // no banco sem apagar o usuário). Em vez de travar o cliente numa conta
                // órfã, acha o usuário existente e recria a linha pra ele.
                const { data: listaUsuarios, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
                const usuarioExistente = !listError && listaUsuarios?.users?.find(
                    u => u.email?.toLowerCase() === email.toLowerCase()
                );

                if (usuarioExistente) {
                    const { error: recreateError } = await supabase
                        .from('profiles')
                        .insert([{
                            id: usuarioExistente.id,
                            nome,
                            cpf: cpfLimpo,
                            email,
                            pago: false
                        }]);

                    if (!recreateError) {
                        return res.status(200).json({
                            success: true,
                            userId: usuarioExistente.id,
                            message: 'Conta recuperada.'
                        });
                    }
                    console.error('Erro ao recriar profile pra usuário órfão:', recreateError.message);
                }
            }
            throw authError;
        }

        const userId = authData.user.id;

        // pago/ebook_pago começam false por padrão da coluna — forma_pagamento só é
        // preenchida quando o pagamento de fato é confirmado (não aqui na criação).
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: userId,
                nome,
                cpf: cpfLimpo,
                email,
                pago: false
            }]);

        if (profileError) throw profileError;

        return res.status(200).json({
            success: true,
            userId,
            message: 'Conta criada com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao criar conta:', error);
        return res.status(400).json({ success: false, error: 'Não foi possível criar sua conta. Tente novamente.' });
    }
}
