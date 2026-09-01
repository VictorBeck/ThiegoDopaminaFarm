# ============================================================
# THIEGO DOPAMINA FARM — wasm/README.md
# Motor WASM (Rust) — opcional, com fallback automático
# ============================================================

## O que é

Um motor determinístico escrito em Rust e compilado para WASM.
Ele replica a aritmética de números gigantes do `js/numbers.js`
e adiciona:

1. **Anti-cheat por recálculo**: o servidor pode re-simular sua
   run a partir de um seed e conferir se o score bate.
2. **Replays determinísticos de batalha**: mesmo seed → mesmo
   resultado, permitindo auditoria do PvP ranqueado.
3. **RNG de alta qualidade** (xorshift64*) idêntico em todos os
   clientes.

## Compilar

Requer [Rust toolchain](https://rustup.rs) (não instalado na
máquina de desenvolvimento atual):

```bash
rustup target add wasm32-unknown-unknown
cd wasm
cargo build --release --target wasm32-unknown-unknown
copy target\wasm32-unknown-unknown\release\tdf_wasm.wasm .\
```

O arquivo `tdf_wasm.wasm` deve ficar em `wasm/tdf_wasm.wasm`.

## Fallback

O jogo tenta carregar `wasm/tdf_wasm.wasm`; se o arquivo não
existir (ainda não compilado), o módulo `js/wasm.js` desativa
silenciosamente e o jogo usa a aritmética JS normal — nada quebra.

## Teste local rápido

```bash
node -e "const m=require('./tools/wasm_test.js'); m();"
```

(requer o .wasm compilado)