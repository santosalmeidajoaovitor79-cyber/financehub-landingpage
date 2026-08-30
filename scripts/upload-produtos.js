// Sobe os arquivos pagos pro bucket privado do Supabase Storage.
//
// Como rodar (na SUA máquina, nunca aqui na sessão — o Claude não tem a
// SUPABASE_SERVICE_ROLE_KEY e não deve ter):
//   1. vercel env pull .env.local
//   2. Coloque os arquivos na pasta arquivos-para-upload/ com os nomes abaixo
//   3. node --env-file=.env.local scripts/upload-produtos.js
//
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const BUCKET = 'produtos-pagos';
const PASTA_LOCAL = 'arquivos-para-upload';

// Nome do arquivo local esperado -> nome que ele vai ter dentro do bucket.
const ARQUIVOS = [
    { local: 'FinanceHub_PRO_ERP_2.xlsx', remoto: 'financehub-pro-essential-pt.xlsx' },
    { local: 'FinanceHub_PRO_ERP_EN.xlsx', remoto: 'financehub-pro-essential-en.xlsx' },
    { local: 'Fluxo-de-Caixa-na-Pratica.pdf', remoto: 'ebook-fluxo-de-caixa-na-pratica-pt.pdf' },
    { local: 'The-Cash-Flow-Playbook.pdf', remoto: 'ebook-the-cash-flow-playbook-en.pdf' },
    { local: 'Manual_de_Uso_FinanceHub_PRO.pdf', remoto: 'manual-de-uso-financehub-pt.pdf' },
];

async function main() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.');
        console.error('Rode: vercel env pull .env.local  — depois: node --env-file=.env.local scripts/upload-produtos.js');
        process.exit(1);
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
        console.error('Erro ao listar buckets:', listError.message);
        process.exit(1);
    }

    if (!buckets.some(b => b.name === BUCKET)) {
        const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
        if (error) {
            console.error(`Erro ao criar bucket "${BUCKET}":`, error.message);
            process.exit(1);
        }
        console.log(`Bucket privado "${BUCKET}" criado.`);
    } else {
        console.log(`Bucket "${BUCKET}" já existe.`);
    }

    for (const arquivo of ARQUIVOS) {
        const caminhoLocal = path.join(PASTA_LOCAL, arquivo.local);
        if (!existsSync(caminhoLocal)) {
            console.log(`(pulado) ${arquivo.local} não encontrado em ${PASTA_LOCAL}/`);
            continue;
        }
        const conteudo = readFileSync(caminhoLocal);
        const { error } = await supabase.storage.from(BUCKET).upload(arquivo.remoto, conteudo, { upsert: true });
        if (error) {
            console.error(`Erro ao subir ${arquivo.local}:`, error.message);
        } else {
            console.log(`✓ ${arquivo.local} -> ${BUCKET}/${arquivo.remoto}`);
        }
    }
}

main();
