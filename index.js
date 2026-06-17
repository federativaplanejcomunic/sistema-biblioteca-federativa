require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const path = require('path');

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
  const { data, error } = await supabase
    .from('casas_espiritas')
    .select('*');

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
//           ROTAS DE LEITORES
// ==========================================
app.get('/api/leitores', async (req, res) => {
  const { data, error } = await supabase
    .from('leitores')
    .select('*')
    .order('nome', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/leitores', async (req, res) => {
  const { cpf, nome, endereco, numero, bairro, estado, cep, whatsapp, status } = req.body;
  
  const { data, error } = await supabase
    .from('leitores')
    .insert([{ cpf, nome, endereco, numero, bairro, estado, cep, whatsapp, status: status || 'Ativo' }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ success: true, data });
});

app.put('/api/leitores/:cpf', async (req, res) => {
  const { cpf } = req.params;
  const { nome, endereco, numero, bairro, estado, cep, whatsapp, status } = req.body;

  const { data, error } = await supabase
    .from('leitores')
    .update({ nome, endereco, numero, bairro, estado, cep, whatsapp, status })
    .eq('cpf', cpf)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
});

// ==========================================
//           ROTAS DE EMPRÉSTIMOS
// ==========================================
app.get('/api/emprestimos', async (req, res) => {
  const { data, error } = await supabase
    .from('emprestimos')
    .select('*, livros(titulo)')
    .eq('status', 'Ativo')
    .order('id', { ascending: false });
    
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/emprestimos', async (req, res) => {
  const { livro_id, nome_leitor } = req.body;

  const { error: empError } = await supabase
    .from('emprestimos')
    .insert([{ livro_id, nome_leitor, status: 'Ativo' }]);

  if (empError) return res.status(500).json({ error: empError.message });

  await supabase.from('livros').update({ status: 'Emprestado' }).eq('id', livro_id);
  res.json({ success: true });
});

app.post('/api/emprestimos/devolver', async (req, res) => {
  const { id, livro_id } = req.body;

  await supabase.from('emprestimos').update({ status: 'Concluído', data_devolucao_real: new Date() }).eq('id', id);
  await supabase.from('livros').update({ status: 'Disponível' }).eq('id', livro_id);

  res.json({ success: true });
});

// ==========================================
//           ROTAS DE DOAÇÕES
// ==========================================
app.get('/api/doacoes', async (req, res) => {
  const { data, error } = await supabase
    .from('doacoes')
    .select('*, livros(titulo)')
    .order('id', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/doacoes', async (req, res) => {
  const { tipo, doador_ou_destinatario, titulo, livro_id } = req.body;
  let finalLivroId = livro_id;

  if (tipo === 'Recebida') {
    const { data: novoLivro, error: livroError } = await supabase
      .from('livros')
      .insert([{ titulo, status: 'Disponível', autor: 'Doador', editora: 'Doação' }])
      .select();

    if (livroError) return res.status(500).json({ error: livroError.message });
    finalLivroId = novoLivro[0].id;
  } else {
    await supabase.from('livros').update({ status: 'Doado' }).eq('id', livro_id);
  }

  const { data, error } = await supabase
    .from('doacoes')
    .insert([{ livro_id: finalLivroId, tipo, doador_ou_destinatario }])
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ==========================================
//          INICIALIZAÇÃO DO SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Sistema COMPLETO: Módulo de Cadastro de Leitores Ativo!`);
  console.log(`🚀 Área Federativa`);
  console.log(`Desenvolvido por Adriana Pedrogao`);
  console.log(`👉 Acesse no seu navegador: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});