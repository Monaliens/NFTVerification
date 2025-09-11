const axios = require("axios");

// NFT Contract Address (Doğru adres!)
const CONTRACT_ADDRESS = "0xae280ca8dfaaf852b0af828cd72391ce7874fbb6";

// Monaliens API
const BASE_URL = "https://api.monaliens.xyz";
const HOLDERS_URL = `${BASE_URL}/api/nft/holders_v2`;

async function testAPI() {
  try {
    console.log("Monaliens API testi başlıyor...");
    console.log("URL:", `${HOLDERS_URL}/${CONTRACT_ADDRESS}`);

    const response = await axios.get(`${HOLDERS_URL}/${CONTRACT_ADDRESS}`);

    console.log("\n=== MONALIENS API RESPONSE ===");
    console.log("Success:", response.data.success);
    console.log("Total Holders:", response.data.data?.totalHolders || 0);

    if (response.data.data && response.data.data.holders) {
      const holders = response.data.data.holders;
      console.log("Holders array length:", holders.length);

      // İlk 5 holder'ı göster
      console.log("\n=== İLK 5 HOLDER ===");
      for (let i = 0; i < Math.min(5, holders.length); i++) {
        const holder = holders[i];
        console.log(`${i + 1}. Holder: ${holder.address}`);
        console.log(`   Token count: ${holder.tokenCount}`);
        console.log(`   Token IDs: [${holder.tokens?.join(", ") || "N/A"}]`);
        console.log();
      }

      // Veri yapısı analizi
      console.log("\n=== VERI YAPISI ANALİZİ ===");
      if (holders.length > 0) {
        const sample = holders[0];
        console.log("Sample holder structure:");
        console.log(
          "- address:",
          typeof sample.address,
          sample.address ? "✓" : "✗",
        );
        console.log(
          "- tokenCount:",
          typeof sample.tokenCount,
          sample.tokenCount !== undefined ? "✓" : "✗",
        );
        console.log(
          "- tokens:",
          Array.isArray(sample.tokens) ? "array" : typeof sample.tokens,
          sample.tokens ? "✓" : "✗",
        );

        if (
          sample.tokens &&
          Array.isArray(sample.tokens) &&
          sample.tokens.length > 0
        ) {
          console.log(
            "- token types:",
            typeof sample.tokens[0],
            "(first token)",
          );
        }
      }

      // Staking ile karşılaştırma için sample data
      console.log("\n=== STAKING KARŞILAŞTIRMA ÖRNEĞİ ===");
      console.log(
        "Staking format: { address: string, tokenCount: number, tokens: string[] }",
      );
      console.log(
        "API format:",
        holders[0]
          ? {
              address: holders[0].address,
              tokenCount: holders[0].tokenCount,
              tokens: holders[0].tokens,
            }
          : "No data",
      );
    }
  } catch (error) {
    console.error("Monaliens API Hata:", error.message);
    if (error.response) {
      console.log("Status:", error.response.status);
      console.log("Data:", error.response.data);
    }
  }
}

testAPI();
