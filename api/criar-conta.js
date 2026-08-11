import { createClient } from '@supabase/supabase-js';

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

    const { nome, cpf, email, password, metodo } = req.body || {};

    // Validação básica no servidor (o front pode ser burlado, o servidor não pode confiar nele)
    if (!nome || !cpf || !email || !password) {
        return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
    }
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ success: false, error: 'E-mail inválido.' });
    }
    if (String(password).length < 8) {
        return res.status(400).json({ success: false, error: 'A senha precisa ter pelo menos 8 caracteres.' });
    }
    const cpfLimpo = String(cpf).replace(/\D/g, '');
    if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
        return res.status(400).json({ success: false, error: 'CPF/CNPJ inválido.' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    try {
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
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('id, pago')
                    .eq('email', email)
                    .maybeSingle();

                if (existingProfile?.pago) {
                    return res.status(409).json({
                        success: false,
                        error: 'Este e-mail já possui uma compra aprovada. Faça login em vez de comprar de novo.'
                    });
                }
                if (existingProfile) {
                    return res.status(200).json({
                        success: true,
                        userId: existingProfile.id,
                        message: 'Retomando compra pendente.'
                    });
                }
            }
            throw authError;
        }

        const userId = authData.user.id;

        const { error: profileError } = await supabase
            .from('profiles')
            .insert([{
                id: userId,
                nome,
                cpf: cpfLimpo,
                email,
                pago: false,
                forma_pagamento: metodo || 'pix'
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
