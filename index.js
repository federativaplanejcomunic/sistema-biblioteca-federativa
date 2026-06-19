require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');
const PDFDocument = require("pdfkit-table");

const app = express();
const PORT = 3000;

// Conexão com o banco de dados Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
//        ROTA: CASAS ESPÍRITAS (CSV)
// ==========================================
app.get('/api/casas-espiritas', async (req, res) => {
  const { data, error } = await supabase.from('casas_espiritas').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==========================================
//           ROTAS DO ACERVO (LIVROS)
// ==========================================
app.get('/api/livros', async (req, res) => {
  const { data, error } = await supabase
    .from('livros')
    .select('*, doacoes(doador_ou_destinatario, tipo)')
    .order('titulo', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/livros', async (req, res) => {
  const { titulo, autor, editora, tombo, classificacao, observacao, isbn } = req.body;
  const { data, error } = await supabase
    .from('livros')
    .insert([{ titulo, autor, editora, tombo, classificacao, observacao, isbn, status: 'Disponível' }])
    .select();
    
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/livros/:id', async (req, res) => {
  const { id } = req.params;
  const { titulo, autor, editora, tombo, classificacao, observacao, status, isbn } = req.body;

  const { data, error } = await supabase
    .from('livros')
    .update({ titulo, autor, editora, tombo, classificacao, observacao, status, isbn })
    .eq('id', id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// ==========================================
// ROTA PARA GERAR O RELATÓRIO MENSAL EM PDF
// ==========================================
app.get("/api/relatorios/pdf-mensal", async (req, res) => {
    try {
        const { data: libros, error } = await supabase
            .from("livros")
            .select("*")
            .order("titulo", { ascending: true });

        if (error) throw error;

        let estoqueAgrupado = {};
        libros.forEach(l => {
            const tituloLimpo = (l.titulo || '').trim().replace(/\s+/g, ' ');
            const autorLimpo = (l.autor || 'Desconhecido').trim().replace(/\s+/g, ' ');
            const classificacaoLimpa = (l.classificacao || '-').trim();
            const chaveUnica = `${tituloLimpo.toLowerCase()}|||${autorLimpo.toLowerCase()}`;

            const statusAtual = (l.status || 'disponível').toLowerCase();
            const ehDisponivel = (statusAtual !== 'emprestado' && statusAtual !== 'doado');

            if (!estoqueAgrupado[chaveUnica]) {
                estoqueAgrupado[chaveUnica] = {
                    titulo: tituloLimpo,
                    autor: autorLimpo,
                    classificacao: classificacaoLimpa,
                    totalExemplares: 0,
                    totalDisponiveis: 0
                };
            }

            estoqueAgrupado[chaveUnica].totalExemplares += 1;
            if (ehDisponivel) {
                estoqueAgrupado[chaveUnica].totalDisponiveis += 1;
            }
        });

        const listaEstoque = Object.values(estoqueAgrupado);
        
        const doc = new PDFDocument({ 
            size: "A4",
            margins: { top: 50, bottom: 60, left: 30, right: 30 },
            bufferPages: true 
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=Relatorio-Inventario-Mensal.pdf");
        doc.pipe(res);

        doc.y = 110;

        const linhasTabela = listaEstoque.map(item => [
            item.titulo,
            item.autor,
            item.classificacao,
            item.totalExemplares.toString(),
            item.totalDisponiveis.toString()
        ]);

        const tabelaConfig = {
            headers: [
                { label: "Título do Livro", property: "0", width: 180, headerColor: "#2c3e50" },
                { label: "Autor", property: "1", width: 140, headerColor: "#2c3e50" },
                { label: "Classif.", property: "2", width: 75, headerColor: "#2c3e50" },
                { label: "Total Est.", property: "3", width: 70, headerColor: "#2c3e50" },
                { label: "Disp. Agora", property: "4", width: 70, headerColor: "#2c3e50" }
            ],
            rows: linhasTabela,
            options: {
                padding: 5,
                fontSize: 10,
                fontFamily: "Helvetica",
                prepareHeader: () => {
                    const numeroPaginaAtual = doc.bufferedPageRange().count;
                    if (numeroPaginaAtual > 1) {
                        return doc.font("Helvetica-Bold").fontSize(0.01).fillColor("#ffffff");
                    }
                    return doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff");
                },
                prepareRow: (row, i) => doc.font("Helvetica").fontSize(10).fillColor("#333333")
            }
        };

        doc.on('pageAdded', () => {
            doc.y = 110;
            tabelaConfig.headers.forEach(h => { h.headerColor = "#ffffff"; });
        });

        await doc.table(tabelaConfig);

        const rangePaginas = doc.bufferedPageRange();
        const totalPaginas = rangePaginas.count;

        for (let i = 0; i < totalPaginas; i++) {
            doc.switchToPage(i);

            const logoFederativa = path.join(__dirname, 'public', 'logo-federativa.png');
            const logoFeesp = path.join(__dirname, 'public', 'logo-feesp.png');

            try { doc.image(logoFederativa, 30, 20, { width: 75 }); } catch(e) { }
            try { doc.image(logoFeesp, 490, 20, { width: 90 }); } catch(e) { }

            doc.fontSize(12).font("Helvetica-Bold").fillColor("#2c3e50").text("FEDERAÇÃO ESPÍRITA DO ESTADO DE SÃO PAULO", 110, 25, { align: "center", width: 375 });
            doc.fontSize(8).font("Helvetica").fillColor("#7f8c8d").text("Área Federativa - Gestão de Controle de Acervos", 110, 40, { align: "center", width: 375 });
            
            doc.moveTo(30, 75).lineTo(565, 75).strokeColor("#eee").stroke();

            doc.moveTo(30, 755).lineTo(565, 755).strokeColor("#eee").stroke();
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#2c3e50").text(`Página ${i + 1} de ${totalPaginas}`, 30, 762, { align: "right", width: 535 });
        }

        doc.end();

    } catch (err) {
        console.error("Erro controlado capturado na geração do PDF:", err);
        if (!res.headersSent) { res.status(500).json({ erro: "Erro interno ao processar PDF." }); }
    }
});

// ==========================================
//           ROTAS DE LEITORES
// ==========================================
app.get('/api/leitores', async (req, res) => {
  const { data, error } = await supabase.from('leitores').select('*').order('nome', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/leitores', async (req, res) => {
  const { cpf, nome, endereco, numero, bairro, estado, cep, whatsapp, status } = req.body;
  const { data, error } = await supabase.from('leitores').insert([{ cpf, nome, endereco, numero, bairro, estado, cep, whatsapp, status }]).select();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Inicialização segura do servidor Express
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Servidor rodando com sucesso em: http://localhost:${PORT}`);
  console.log(`👉 Desenvolvido por: Adriana Pedrogão - FEESP`);
  console.log(`==================================================\n`);
}).on('error', (err) => {
    console.error("❌ Erro fatal ao ligar o servidor:", err.message);
});
