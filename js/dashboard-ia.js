/* ==========================================
   DASHBOARD IA - parsing, perfilamento, chamada de API, cálculo e render
   Toda a base completa da planilha fica só no navegador (nesta variável).
   Só nomes de coluna + até 3 exemplos por coluna vão pro backend.
========================================== */

const LIMITE_TAMANHO_MB = 10;
const ESTADOS = ['estado-vazio', 'estado-lendo', 'estado-analisando', 'estado-pronto', 'estado-ilegivel', 'estado-erro'];

let baseCompleta = [];
let graficosAtivos = [];

function mostrarEstado(id) {
    ESTADOS.forEach(estadoId => {
        const el = document.getElementById(estadoId);
        if (el) el.classList.toggle('hidden', estadoId !== id);
    });
}

function limparGraficos() {
    graficosAtivos.forEach(g => g.destroy());
    graficosAtivos = [];
}

function inferirTipo(valores) {
    const amostra = valores.filter(v => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 20);
    if (amostra.length === 0) return 'texto';

    const pareceData = (v) => {
        if (v instanceof Date) return true;
        const s = String(v).trim();
        return /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s);
    };
    if (amostra.filter(pareceData).length / amostra.length > 0.6) return 'data';

    const pareceNumero = (v) => {
        if (typeof v === 'number') return true;
        const limpo = String(v).trim().replace(/\./g, '').replace(',', '.');
        return limpo !== '' && !isNaN(Number(limpo));
    };
    if (amostra.filter(pareceNumero).length / amostra.length > 0.6) return 'numero';

    return 'texto';
}

function escolherAbaComMaisLinhas(workbook) {
    let melhorNome = workbook.SheetNames[0];
    let melhorLinhas = -1;
    for (const nome of workbook.SheetNames) {
        const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[nome], { defval: null });
        if (linhas.length > melhorLinhas) {
            melhorLinhas = linhas.length;
            melhorNome = nome;
        }
    }
    return melhorNome;
}

function perfilarColunas(linhas) {
    if (linhas.length === 0) return [];
    const nomesColunas = Object.keys(linhas[0]);
    return nomesColunas.map(nome => {
        const valores = linhas.map(l => l[nome]);
        const tipo = inferirTipo(valores);
        const exemplos = valores
            .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
            .slice(0, 3)
            .map(v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 200));
        return { nome, tipo, exemplos };
    });
}

function paraNumero(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return null;
    const limpo = String(v).trim().replace(/\./g, '').replace(',', '.');
    if (limpo === '') return null;
    const n = Number(limpo);
    return isNaN(n) ? null : n;
}

function calcularMetrica(linhas, metrica) {
    if (metrica.agregacao === 'count') return linhas.length;

    if (metrica.agregacao === 'count_distinct') {
        return new Set(linhas.map(l => l[metrica.coluna])).size;
    }

    const valores = linhas.map(l => paraNumero(l[metrica.coluna])).filter(v => v !== null);
    if (valores.length === 0) return 0;
    if (metrica.agregacao === 'sum') return valores.reduce((a, b) => a + b, 0);
    if (metrica.agregacao === 'average') return valores.reduce((a, b) => a + b, 0) / valores.length;
    return 0;
}

function chaveMes(valor) {
    const data = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(data.getTime())) return { ordenacao: '9999-99', rotulo: 'Desconhecido' };
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return {
        ordenacao: `${ano}-${mes}`,
        rotulo: data.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
    };
}

function calcularGrafico(linhas, grafico) {
    const grupos = new Map(); // chave de ordenação -> { rotulo, soma, contagem }

    for (const linha of linhas) {
        const bruto = linha[grafico.coluna_categoria];
        let chave, rotulo;

        if (grafico.agrupar_por_mes) {
            const info = chaveMes(bruto);
            chave = info.ordenacao;
            rotulo = info.rotulo;
        } else {
            rotulo = (bruto === null || bruto === undefined || String(bruto).trim() === '') ? 'Não informado' : String(bruto);
            chave = rotulo;
        }

        const valorNumerico = grafico.agregacao === 'count' ? 1 : paraNumero(linha[grafico.coluna_valor]);
        if (grafico.agregacao !== 'count' && valorNumerico === null) continue;

        if (!grupos.has(chave)) grupos.set(chave, { rotulo, soma: 0, contagem: 0 });
        const acumulado = grupos.get(chave);
        acumulado.soma += valorNumerico;
        acumulado.contagem += 1;
    }

    let entradas = Array.from(grupos.entries()).map(([chave, { rotulo, soma, contagem }]) => ({
        chave,
        rotulo,
        valor: grafico.agregacao === 'average' ? soma / contagem : soma,
    }));

    entradas.sort(grafico.agrupar_por_mes
        ? (a, b) => a.chave.localeCompare(b.chave)
        : (a, b) => b.valor - a.valor);

    entradas = entradas.slice(0, 12);

    return { labels: entradas.map(e => e.rotulo), valores: entradas.map(e => e.valor) };
}

function mostrarErro(mensagem) {
    document.getElementById('texto-erro').textContent = mensagem;
    mostrarEstado('estado-erro');
}

function mostrarIlegivel(motivo) {
    document.getElementById('texto-motivo').textContent = motivo;
    mostrarEstado('estado-ilegivel');
}

function renderizarResultado(plano, linhas) {
    limparGraficos();

    document.getElementById('badge-tipo').textContent = plano.tipo_planilha || 'Planilha';
    document.getElementById('texto-resumo').textContent = plano.resumo || '';

    const { CORES, formatarValor, renderizarGrafico } = window.DashboardCharts;

    const gradeMetricas = document.getElementById('grade-metricas');
    gradeMetricas.innerHTML = '';
    (plano.metricas || []).forEach(metrica => {
        const valor = calcularMetrica(linhas, metrica);
        const card = document.createElement('div');
        card.className = 'rounded-2xl p-6 bg-white shadow-sm';
        card.style.borderTop = `3px solid ${CORES.gold}`;
        card.innerHTML = `
            <p class="text-sm font-medium" style="color:${CORES.cinza}">${metrica.titulo}</p>
            <p class="text-3xl font-extrabold mt-2" style="color:${CORES.navy}">${formatarValor(valor, metrica.formato)}</p>
        `;
        gradeMetricas.appendChild(card);
    });

    const gradeGraficos = document.getElementById('grade-graficos');
    gradeGraficos.innerHTML = '';
    (plano.graficos || []).forEach((grafico, index) => {
        const { labels, valores } = calcularGrafico(linhas, grafico);
        const wrapper = document.createElement('div');
        wrapper.className = 'rounded-2xl p-6 bg-white shadow-sm';
        wrapper.innerHTML = `
            <p class="font-bold mb-4" style="color:${CORES.navy}">${grafico.titulo}</p>
            <div style="height:280px"><canvas id="grafico-${index}"></canvas></div>
        `;
        gradeGraficos.appendChild(wrapper);
        const canvas = wrapper.querySelector('canvas');
        graficosAtivos.push(renderizarGrafico(canvas, grafico, labels, valores));
    });

    mostrarEstado('estado-pronto');
}

async function processarArquivo(file) {
    if (!file) return;

    if (file.size > LIMITE_TAMANHO_MB * 1024 * 1024) {
        mostrarErro(`Arquivo muito grande. O limite é ${LIMITE_TAMANHO_MB} MB.`);
        return;
    }

    mostrarEstado('estado-lendo');
    const textoLendo = document.getElementById('texto-lendo');
    if (textoLendo) textoLendo.textContent = `Lendo ${file.name}...`;

    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const nomeAba = escolherAbaComMaisLinhas(workbook);
        const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { defval: null });

        if (linhas.length === 0) {
            mostrarIlegivel('A planilha não tem nenhuma linha de dados.');
            return;
        }

        baseCompleta = linhas;
        const colunas = perfilarColunas(linhas);

        mostrarEstado('estado-analisando');

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) {
            mostrarErro('Sua sessão expirou. Atualize a página e faça login novamente.');
            return;
        }

        const resp = await fetch('/api/analisar-planilha', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                nomeArquivo: file.name,
                abaAnalisada: nomeAba,
                totalLinhas: linhas.length,
                colunas,
            }),
        });

        const plano = await resp.json();

        if (!resp.ok) {
            mostrarErro(plano.erro || 'Não foi possível analisar a planilha agora.');
            return;
        }

        if (!plano.legivel) {
            mostrarIlegivel(plano.motivo || 'Não conseguimos identificar uma tabela de dados nesse arquivo.');
            return;
        }

        renderizarResultado(plano, linhas);

    } catch (err) {
        console.error('Erro ao processar planilha:', err);
        mostrarErro('Não foi possível ler esse arquivo. Confira se é um .xlsx, .xls ou .csv válido.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const inputArquivo = document.getElementById('input-arquivo');
    const zonaDrop = document.getElementById('zona-drop');
    const btnTentarNovamente = document.getElementById('btn-tentar-novamente');
    const btnTentarOutro = document.getElementById('btn-tentar-outro');
    const btnNovaAnalise = document.getElementById('btn-nova-analise');

    inputArquivo.addEventListener('change', (e) => processarArquivo(e.target.files[0]));

    zonaDrop.addEventListener('click', () => inputArquivo.click());
    zonaDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        zonaDrop.classList.add('border-brand-500');
    });
    zonaDrop.addEventListener('dragleave', () => zonaDrop.classList.remove('border-brand-500'));
    zonaDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        zonaDrop.classList.remove('border-brand-500');
        processarArquivo(e.dataTransfer.files[0]);
    });

    const reiniciar = () => {
        limparGraficos();
        inputArquivo.value = '';
        mostrarEstado('estado-vazio');
    };

    if (btnTentarNovamente) btnTentarNovamente.addEventListener('click', reiniciar);
    if (btnTentarOutro) btnTentarOutro.addEventListener('click', reiniciar);
    if (btnNovaAnalise) btnNovaAnalise.addEventListener('click', reiniciar);
});
