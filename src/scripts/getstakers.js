const { ethers } = require("ethers");

// RPC ve kontrat bilgileri
const RPC_URL =
  "https://convincing-billowing-forest.monad-testnet.quiknode.pro/7baeb1195f9311a73ade67aef1ca56fc6d3011d5";
const CONTRACT_ADDRESS = "0x10961892D9262D8cfeaD2b5E02C0a917b938D59F";

// Kontrat ABI (sadece ihtiyacımız olan fonksiyon)
const ABI = [
  {
    inputs: [],
    name: "getStakersSnapshot",
    outputs: [
      {
        internalType: "address[]",
        name: "stakers",
        type: "address[]",
      },
      {
        internalType: "uint256[][]",
        name: "tokenIds",
        type: "uint256[][]",
      },
      {
        internalType: "uint256[][]",
        name: "stakeDurations",
        type: "uint256[][]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

async function getSnapshot() {
  try {
    // Provider oluştur
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

    // Kontrat instance oluştur
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    console.log("Snapshot çekiliyor...");

    // Snapshot fonksiyonunu çağır
    const result = await contract.getStakersSnapshot();

    console.log("\n=== STAKING SNAPSHOT ===");
    console.log("Toplam staker sayısı:", result[0].length);

    // Her staker için bilgileri göster
    for (let i = 0; i < result[0].length; i++) {
      const staker = result[0][i];
      const tokenIds = result[1][i];
      const stakeDurations = result[2][i];

      console.log(`\n${i + 1}. Staker: ${staker}`);
      console.log(`   Token sayısı: ${tokenIds.length}`);
      console.log(`   Token ID'ler: [${tokenIds.join(", ")}]`);

      // Stake sürelerini gün olarak göster
      const daysStaked = stakeDurations.map((duration) => {
        const days = Number(duration) / (24 * 60 * 60);
        return days.toFixed(2);
      });
      console.log(`   Stake süreleri (gün): [${daysStaked.join(", ")}]`);
    }
  } catch (error) {
    console.error("Hata:", error.message);

    if (error.message.includes("execution reverted")) {
      console.log("\nMuhtemel sebepler:");
      console.log("- Gas limit aşıldı (çok fazla data)");
      console.log("- Kontrat internal hatası");
      console.log("- Array boyutu çok büyük");
    }
  }
}

// Scripti çalıştır
getSnapshot();
