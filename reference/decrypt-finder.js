// ============================================================
// Lordflix RSA Decrypt Finder - Paste in DevTools Console on lordflix.org
// ============================================================

(async () => {
  const CHUNKS = [
    "1PFQ1rlT","5Fr4K5v4","5ZA6mera","5t26w8Ki","B6ZjSbki",
    "B8OnTY3f","BAaXK17O","BEXN0-cg","BHuJADC2","BPO2DzH1",
    "BWgDO8yw","Beq_5jH0","BlYZu5KP","Bmpnpdxa","C8Wavqob",
    "C9oylHkR","CC6x79vm","CDDXySbA","CNVZ99dm","CmwzMrjJ",
    "Cp2x8l1r","CqAJ19AU","CqcEpq_Q","D04HTn1L","D5KwGkc0",
    "DCvch8uk","DEnqy20T","DGnQSu5Z","DLseIQfU","DQ2VIsxy",
    "DSm1r-pw","DXLNPD5A","DZ7BjsTy","DZY1uvKP","DdLnLPdY",
    "DlMdn9Ym","DliDauFH","DsnmJJEf","HSMk10a0","Sb59cuNX",
    "WdSZYx-S","ZxBo2Vxx","e90IHA3d","N0f0gQZp"
  ];

  const ENTRY = ["start.Tp81hpMA","app.C4v4Qt8k"];
  const NODES = ["17","18"];

  const KEYWORDS = [
    "decrypt","JSEncrypt","setPrivateKey","-----BEGIN","privateKey",
    "RSAKey","CryptoJS","forge","KJUR","pkcs","crypto.subtle",
    "private_key","PRIVATE KEY","doDecrypt","setKey","importKey",
    "b64tohex","hex2b64","setMaxDigits","BI_RM","RSAKeyPair",
    "encryptedString","decryptedString"
  ];

  const BASE = "/_app/immutable/";

  console.log("%c🔍 LORDFLIX DECRYPT FINDER", "font-size:20px;color:#ff6600;font-weight:bold");
  console.log("%cScanning " + (CHUNKS.length + ENTRY.length + NODES.length) + " files for " + KEYWORDS.length + " keywords...\n", "color:#888");

  const results = [];
  let scanned = 0;

  // Fetch file content
  async function fetchFile(path) {
    try {
      const r = await fetch(BASE + path + ".js");
      return await r.text();
    } catch (e) {
      return null;
    }
  }

  // Search a single file
  function searchFile(name, content) {
    if (!content) return;
    const hits = [];

    for (const kw of KEYWORDS) {
      let idx = -1;
      const kwLower = kw.toLowerCase();
      const contentLower = content.toLowerCase();

      while ((idx = contentLower.indexOf(kwLower, idx + 1)) !== -1) {
        // Extract surrounding context (200 chars before and after)
        const start = Math.max(0, idx - 200);
        const end = Math.min(content.length, idx + kw.length + 200);
        let context = content.substring(start, end);
        // Add line breaks markers
        context = context.replace(/\n/g, "↵");

        hits.push({
          keyword: kw,
          position: idx,
          context: context
        });
      }
    }

    if (hits.length > 0) {
      results.push({ file: name, size: content.length, hits });
    }
  }

  // Scan all chunks
  for (const chunk of CHUNKS) {
    scanned++;
    const content = await fetchFile("chunks/" + chunk);
    searchFile("chunks/" + chunk + ".js", content);
    const pct = Math.round(scanned / (CHUNKS.length + ENTRY.length + NODES.length) * 100);
    console.log("%c[" + pct + "%]%c Scanned: chunks/" + chunk + ".js" +
      (content ? " (" + content.length + " bytes)" : " [FAILED]"),
      "color:#aaa", "color:#333"
    );
  }

  // Scan entry files
  for (const entry of ENTRY) {
    scanned++;
    const content = await fetchFile("entry/" + entry);
    searchFile("entry/" + entry + ".js", content);
    console.log("%c Scanned: entry/" + entry + ".js", "color:#333");
  }

  // Scan node files
  for (const node of NODES) {
    scanned++;
    const content = await fetchFile("nodes/" + node);
    searchFile("nodes/" + node + ".js", content);
    console.log("%c Scanned: nodes/" + node + ".js", "color:#333");
  }

  // Print results
  console.log("\n%c========================================", "color:#ff6600");
  console.log("%c🔍 SCAN COMPLETE - RESULTS", "font-size:16px;color:#ff6600;font-weight:bold");
  console.log("%c========================================\n", "color:#ff6600");

  if (results.length === 0) {
    console.log("%c❌ No decryption keywords found in any file.", "color:red;font-size:14px");
    console.log("%cThe decryption logic might be:", "color:orange");
    console.log("%c  1. Hidden in dynamically generated code", "color:#333");
    console.log("%c  2. Loaded from a different domain/CDN", "color:#333");
    console.log("%c  3. Using WebAssembly (.wasm)", "color:#333");
    console.log("%c  4. Inside an inline <script> tag in HTML", "color:#333");
  } else {
    // Sort by hit count (most hits first)
    results.sort((a, b) => b.hits.length - a.hits.length);

    for (const file of results) {
      console.log(
        "%c📄 " + file.file + " %c(" + file.hits.length + " hits, " + file.size + " bytes)",
        "color:#0066ff;font-weight:bold;font-size:13px",
        "color:#888"
      );

      // Deduplicate by keyword
      const seen = new Set();
      for (const hit of file.hits) {
        const key = hit.keyword + "@" + hit.position;
        if (seen.has(key)) continue;
        seen.add(key);

        console.log(
          "%c  ⚡ %c" + hit.keyword + "%c at position " + hit.position,
          "color:#ff6600", "color:red;font-weight:bold", "color:#666"
        );
        console.log("%c  " + hit.context, "color:#444;font-size:11px");
        console.log("");
      }

      console.log("%c  ---", "color:#ddd");
      console.log("");
    }
  }

  // Also check for PEM key patterns (long base64 strings)
  console.log("\n%c========================================", "color:#9900ff");
  console.log("%c🔐 SEARCHING FOR RSA KEY PATTERNS", "font-size:16px;color:#9900ff;font-weight:bold");
  console.log("%c========================================\n", "color:#9900ff");

  // Collect all fetched content
  const allFiles = [];
  for (const chunk of CHUNKS) {
    const c = await fetchFile("chunks/" + chunk);
    if (c) allFiles.push({ name: "chunks/" + chunk + ".js", content: c });
  }

  const pemPattern = /-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g;
  const b64LongPattern = /["']([A-Za-z0-9+/=]{200,})["']/g;

  for (const f of allFiles) {
    // Check PEM format
    const pemMatches = f.content.match(pemPattern);
    if (pemMatches) {
      for (const pm of pemMatches) {
        console.log("%c  🔑 PEM KEY FOUND in " + f.name + ":", "color:#00cc00;font-weight:bold");
        console.log("%c" + pm.substring(0, 100) + "...", "color:#006600;font-size:11px");
        console.log("%c[FULL KEY LENGTH: " + pm.length + " chars]", "color:#888");
        console.log("");
      }
    }

    // Check for long base64 strings (potential keys)
    const b64Matches = [];
    let m;
    while ((m = b64LongPattern.exec(f.content)) !== null) {
      if (m[1].length >= 300) {
        b64Matches.push(m[1]);
      }
    }
    if (b64Matches.length > 0) {
      console.log("%c  🔑 LONG BASE64 STRING in " + f.name + ":", "color:#cc9900;font-weight:bold");
      for (const bm of b64Matches) {
        console.log("%c  Length: " + bm.length + " chars", "color:#886600");
        console.log("%c  Preview: " + bm.substring(0, 120) + "...", "color:#886600;font-size:11px");
        console.log("");
      }
    }
  }

  // Final summary
  console.log("\n%c========================================", "color:#00cc00");
  console.log("%c✅ DONE! Check results above.", "font-size:16px;color:#00cc00;font-weight:bold");
  console.log("%c========================================", "color:#00cc00");

  // Return results as object for further use
  return results;
})();
