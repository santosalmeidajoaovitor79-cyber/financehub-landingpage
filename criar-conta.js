import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { nome, cpf, email, password } = req.body;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Conecta usando a chave de servidor (Service Role)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Cria o usuário no Auth do Supabase
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true // Confirma o e-mail automaticamente
        });

        if (authError) throw authError;

        const userId = authData.user.id;

        // 2. Insere os dados complementares na tabela 'profiles'
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([
                { id: userId, nome: nome, cpf: cpf, email: email, pago: false }
            ]);

        if (profileError) throw profileError;

        return res.status(200).json({ 
            success: true, 
            message: 'Conta criada e registrada com sucesso!',
            userId: userId
        });

    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
}
