// ============================================================
// THIEGO DOPAMINA FARM — wasm/src/lib.rs
// Motor determinístico em Rust → WASM (estilo extern "C", sem
// wasm-bindgen — compila direto com cargo, sem CLI adicional).
//
// Compilar:
//   rustup target add wasm32-unknown-unknown
//   cargo build --release --target wasm32-unknown-unknown
//   copy target\wasm32-unknown-unknown\release\tdf_wasm.wasm .\
//
// O jogo carrega wasm/tdf_wasm.wasm se existir; senão usa o
// fallback em JS (numbers.js) — nada quebra sem o .wasm.
// ============================================================

// ---------- RNG determinístico (xorshift64*) ----------
#[no_mangle]
pub extern "C" fn rng_seed_from_str(ptr: *const u8, len: usize) -> u64 {
    if ptr.is_null() { return 0xcbf29ce484222325; }
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

#[no_mangle]
pub extern "C" fn rng_next(state: u64) -> u64 {
    let mut x = state;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    x.wrapping_mul(0x2545F4914F6CDD1D)
}

/// Semente + passo → double em [0,1) (determinístico, sem estado)
#[no_mangle]
pub extern "C" fn rng_next_f64(seed: u64, step: u64) -> f64 {
    let mut s = seed.wrapping_add(step.wrapping_mul(0x9E3779B97F4A7C15));
    s = rng_next(s);
    (s >> 11) as f64 / (1u64 << 53) as f64
}

#[no_mangle]
pub extern "C" fn rng_chance(seed: u64, step: u64, p: f64) -> i32 {
    if rng_next_f64(seed, step) < p { 1 } else { 0 }
}

// ---------- aritmética em log10 (para números gigantes) ----------
// Soma aproximada de dois números em escala log10.
// log10(a+b) = log10a + log10(1 + 10^(log10b-log10a))
#[no_mangle]
pub extern "C" fn big_add_log10(la: f64, lb: f64) -> f64 {
    if !la.is_finite() { return lb; }
    if !lb.is_finite() { return la; }
    if la > lb {
        la + (1.0 + 10f64.powf(lb - la)).log10()
    } else {
        lb + (1.0 + 10f64.powf(la - lb)).log10()
    }
}

// Multiplicação: log10(a*b) = la + lb
#[no_mangle]
pub extern "C" fn big_mul_log10(la: f64, lb: f64) -> f64 {
    la + lb
}

// Potência: log10(a^p) = la * p
#[no_mangle]
pub extern "C" fn big_pow_log10(la: f64, p: f64) -> f64 {
    la * p
}

// ---------- validação de save (anti-cheat) ----------
#[no_mangle]
pub extern "C" fn validate_save_total(log10_total: f64, play_time_sec: f64, reported_clicks: f64) -> i32 {
    if !log10_total.is_finite() || log10_total <= 0.0 { return 0; }
    if play_time_sec < 0.0 || reported_clicks < 0.0 { return 0; }
    let max_log_by_time = 20.0 + (1.0 + play_time_sec / 3600.0).log10() * 5.0;
    let clicks_per_sec = if play_time_sec > 0.0 { reported_clicks / play_time_sec } else { 0.0 };
    if log10_total <= max_log_by_time + 1.0 && clicks_per_sec <= 20.0 { 1 } else { 0 }
}

// ---------- simulação determinística de uma run ----------
// Retorna o log10 final. Amostra 10 passos/s.
// seed é f64 (o JS não precisa de BigInt; converte-se para u64).
#[no_mangle]
pub extern "C" fn simulate_run(seed: f64, seconds: f64, dps_log10: f64, click_log10: f64, crit_chance: f64, crit_mult: f64) -> f64 {
    let seed_u64 = seed as u64;
    let steps = (seconds * 10.0).max(0.0) as u64;
    let mut total = dps_log10;
    let mut step: u64 = 0;
    for _ in 0..steps {
        step += 1;
        total = big_add_log10(total, dps_log10 * 0.1);
        if rng_chance(seed_u64, step, 0.8) == 1 {
            if rng_chance(seed_u64, step + 1_000_000, crit_chance) == 1 {
                total = big_add_log10(total, click_log10 + crit_mult.log10());
            } else {
                total = big_add_log10(total, click_log10);
            }
        }
    }
    total
}

// ---------- teste de sanidade ----------
#[no_mangle]
pub extern "C" fn wasm_sanity() -> i32 {
    // 1e300 + 5e300 ≈ 6e300 → log10 ≈ 300.78
    let sum = big_add_log10(300.0, 300.0 + 5f64.log10());
    let ok = (sum - 300.7781).abs() < 0.01;
    // validação: save grande em pouco tempo → inválido
    let bad = validate_save_total(50.0, 60.0, 100.0);
    if ok && bad == 0 { 1 } else { 0 }
}