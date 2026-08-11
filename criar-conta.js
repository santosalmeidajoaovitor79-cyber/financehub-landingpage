import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. Headers de CORS (Evita bloqueios do navegador)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Resposta rápida para o preflight do navegador
    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Bloqueia métodos indevidos
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // 2. Agora recebemos também o "metodo" (pix ou card) enviado pelo checkout
    const { nome, cpf, email, password, metodo } = req.body;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Conecta usando a chave de servidor (Service Role - Segura)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 3. Cria o usuário no Auth do Supabase (Acesso VIP)
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true // Confirma o e-mail automaticamente
        });

        if (authError) throw authError;

        const userId = authData.user.id;

        // 4. Insere os dados na tabela 'profiles', registrando a forma de pagamento
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([
                { 
                    id: userId, 
                    nome: nome, 
                    cpf: cpf, 
                    email: email, 
                    pago: false,
                    forma_pagamento: metodo || 'pix' // Salva 'pix' ou 'card'
                }
            ]);

        if (profileError) throw profileError;

        // 5. Devolve o sucesso para o HTML continuar o fluxo
        return res.status(200).json({ 
            success: true, 
            message: 'Conta criada e registrada com sucesso!',
            userId: userId,
            metodoEscolhido: metodo
        });

    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
}
