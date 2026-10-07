---
title: "Inside TT-Wormhole: full Architecture"
date: 2026-10-07
excerpt: A friendly tour of Tenstorrent Wormhole n150 — the die, the NoC, Tensix tiles, memory and compute — with diagrams and our own card numbers.
---

Hii, Today I am going to explain a little bit about a very cool Hardware which you may not have heard of - Tenstorrent!. we will be talking about tt-wormhole architecture especially the n150 one.
wormhole-n150 have 2 versions.
1. n150d
2. n150s

There only 2 major differences in both of these n150d have a Active(axial fan) and n150s have a Passive cooling. second is Dimensions width and depth are increased a little in n150d height is same for both.
A block diagram of n150d.

![Wormhole n150 architecture: one Tensix tile, the 10 x 12 NoC grid of the die, the edge tiles and the host link](/wormhole_n150.png "Figure 1: Wormhole n150 architecture.")

Overall the wormhole n150 have these things:-
1. Wormhole ASICs -> 1
2. Tensix cores -> 72
3. SRAM -> 108MB
4. Memory -> 12GB(GDDR6)
5. Compute -> 262TFLOPS(FP8)
6. total board power -> 160W
7. 2x Warp 100 Bridge, 2x QSFP-DD 200G
8. PCIe 4.0 x16
9. Cooling -> Active(axial fan) in n150d, passive cooling in n150s

Now we are gonna try to look a bit deeper in all these components

## 1. Wormhole ASIC(The Die)
The Die is the main part of whole card. Basically all the tiles sits on a 10x12 grid(Figure 1). These are the tiles :
- 80 Tensix tiles(T) — the compute tiles.
- 18 DRAM tiles(D) - collectively exposing 12 GiB of GDDR6 (each 2 GiB is exposed identically on 3 tiles).
- 16 Ethernet tiles(E) - each with bidirectional 100 GbE.
- 1 PCI Express Tile(PCIe) - for PCIe 4.0 x16 to the host.
- 1 ARC tile(ARC) - for chip and board management.
- 2 NoCs connecting all of the above.

**Harvesting** The Wormhole chip has a full 8x10 Tensix grid (8 columns, 10 rows). On Wormhole, only Tensix row harvesting is supported — the number of columns always stays at 8, but the number of rows can decrease. n150d has 1 row harvested resulting in 72 Tensix cores(8x9=72)

## 2. NoC (Network on Chip)
NoC is component that helps connect Tiles to each other that's the job of the NoC. Wormhole has **2 NoCs** (NoC 0 and NoC 1), and both of them connect every single tile on the die.
They connect the same set of tiles but are physically seperate and flow in opposite directions, which forms a **2D torus** topology.
- NoC 0 -> data flows rightwards and downwards
- NoC 1 -> data flows leftwards and upwards

![NoC 0 vs NoC 1: flow directions on the 10 x 12 grid and the route of one packet from T13 to the D4 tile in row 8 on each NoC](/noc_flow.png "Figure 2: NoC 0 vs NoC 1 flow, with one example route.")

NoC can basically do these 3 things
1. Read -> It can grab a contiguous chunk from another tile's address space and bring it back.
2. Write -> send data to another tile. writes can be broadcast to a whole rectangle of tiles, but broadcast reciever can ony be Tensix tiles. Two types of writes

i. unicast writes.

ii. multicast writes -> when you have issue the same write to many tiles. As per official docs Multicast is ~16x faster than 16 seperate unicast writes for broadcast operations. there are very beautifull kernels to measure NoC Performances you can read them here ([NoC docs](https://docs.tenstorrent.com/tt-vscode-toolkit/lessons/cs-fundamentals-04-networks/#part-4-hands-on-measuring-noc-performance))
3. Atomic -> a 32-bit operation on 128 bits of the receiver's L1, with a 32-bit result sent back. Atomics can also be broadcast to Tensix tiles.
supported Atomic instructions: NOP, INCR_GET, INCR_GET_PTR, SWAP, CAS, GET_TILE_MAP, STORE_IND, SWAP_4B.

One important thing: there is no **cache coherence** here. The NoC just moves bytes from one address space to another when software asks it to, and NoC transactions run asynchronously, so software checks counters to know when a transaction is done.

## 3. The Tensix Tile
The Tensix tile is the real worker of this chip. n150 gives us 72 of them (the red T tiles in Figure 1). Each Tensix tile contains:
1. 1464 KiB of RAM called L1
2. 5 "baby" RISC-V cores (RV32IM)
3. 2 NoC connections (one to each NoC) and 1 NoC overlay, a little coprocessor that helps with NoC transactions
4. 1 Tensix coprocessor -> 2 Unpackers, 1 Matrix Unit (FPU), 1 Vector Unit (SFPU), 1 Scalar Unit (ThCon), 4 Packers
5. some small helper devices for the RISC-V cores -> the mover, mailboxes, TDMA-RISC, a debug timestamper and the PIC

![Wormhole Tensix tile: five baby RISC-V cores, the Tensix coprocessor, 1464 KiB of L1 and the two NoC routers](/tensix_tile.png "Figure 3: One Wormhole Tensix tile.")

**5 baby RISC-V cores** : 32-bit, in-order, single-issue cores, each made to execute one RV32IM instruction per cycle at 1 GHz. Their names are RISCV B, RISCV T0, RISCV T1, RISCV T2 and RISCV NC. In the hardware register names and in TT-Metalium's code you will see them as:
1. RISCV B -> **BRISC**
2. RISCV T0 -> **TRISC0** (Unpack)
3. RISCV T1 -> **TRISC1** (Math)
4. RISCV T2 -> **TRISC2** (Pack)
5. RISCV NC -> **NCRISC**

When you create a data movement kernel in TT-Metalium you choose `DataMovementProcessor::RISCV_0`, which is BRISC, or `DataMovementProcessor::RISCV_1`, which is NCRISC.

| | RISCV B (BRISC) | RISCV T0 (TRISC0) | RISCV T1 (TRISC1) | RISCV T2 (TRISC2) | RISCV NC (NCRISC) |
|---|---|---|---|---|---|
| Local data RAM | 4 KiB | 2 KiB | 2 KiB | 2 KiB | 4 KiB |
| Local instruction memory | 2 KiB cache | 2 KiB cache | ½ KiB cache | 2 KiB cache | ½ KiB cache + 16 KiB RAM |
| Talks to the Tensix coprocessor | OK | Great | Great | Great | only via debug bus |
| Used by TT-Metalium for | data movement | compute (UNPACK) | compute (MATH) | compute (PACK) | data movement |

Here is the interesting part: these RISC-V cores are **not** where the speed comes from. Tenstorrent's own docs say the natural split is 2 cores overseeing the NoC and 3 cores overseeing the Tensix coprocessor. They are the managers, the coprocessor and the NoCs do the heavy lifting.

Some small details that are good to know:
- They implement the full RV32IM set, but `fence` runs as a `nop`, so it can't be used to order memory.
- They don't have the "A" (atomic) extension, so for atomics they ask the Scalar Unit (ThCon) or the NoC to do it for them.
- They can only execute code from L1 or from a core-local instruction RAM, and only RISCV NC (NCRISC) has one (16 KiB).
- T0, T1 and T2 send work to the coprocessor by pushing 32-bit Tensix instructions into it (more on this in the compute section).

## 4. Memory
Wormhole doesn't put data caches in front of its memory the way a GPU does. Every piece of data lives somewhere you choose, and moves only when you move it. Figure 4 shows the whole hierarchy, from the registers right next to the math down to host memory.

![Wormhole n150 memory hierarchy: Tensix registers and RISC-V local RAM, L1 SRAM, other tiles' L1 over the NoC, GDDR6 DRAM and host memory over PCIe](/memory.png "Figure 4: Wormhole n150 memory hierarchy.")

Here are the 3 levels you will deal with the most.

**1. L1 (inside every Tensix tile)**
Each Tensix tile has 1464 KiB or 1.5MB of SRAM called L1, mapped at base adress `0x00000000`. 72 x 1.5 MB = 108 MB, the SRAM number of the n150. It is Organized as **16 banks of 91.6 KiB, each capable of one 128-bit read or write per cycle

Who can read and write L1, and how fast (theoretical peak):
1. RISC-V store -> one 32-bit write every 5 cycles (slow!)
2. RISC-V load -> four 32-bit reads every 7 cycles
3. Unpackers -> 4 x 128-bit reads per cycle with one unpacker, 5 with both
4. Packers -> 4 packers, each one 128-bit write per cycle
5. Each NoC -> 256 bits read + 256 bits written per cycle

Note that Other Tensix cores can also access this via NoC.


**2. Local RAM of the RISC-V cores**
Each baby RISC-V also has its own tiny private data RAM (4 KiB for B and NC, 2 KiB for T0/T1/T2, see the table above). A load from it takes 2 cycles, while a load from L1 takes at least 8 cycles, so Tenstorrent strongly recommends keeping the call stack and hot variables here.

**3. DRAM (GDDR6)**
Finally the big one: 12 GB of GDDR6 on a 192-bit bus at 12 GT/s.
- On the die, the 18 DRAM tiles (D) come in 6 groups of 3.
- Each group controls 2 GDDR6 channels of 1 GiB, so 12 channels and 12 GiB in total.
- Any of the 3 tiles in a group can reach that group's full 2 GiB.
- DRAM tiles only answer requests, they never start a transaction themselves.

**Bandwidth** L1 SRAM have a Access latency of ~1-2 cycles; and bandwidth of ~1TB/s. DRAM have a latency of ~200+ cycbles and a bandwidth of 288GB/s.

## 5. Compute
All the FLOPS of the n150 come from the Tensix coprocessor inside each tile. On paper (official spec) the n150 gives:
1. FP8 -> 262 TFLOPS
2. FP16 -> 74 TFLOPS
3. BLOCKFP8 -> 148 TFLOPS

**How the coprocessor gets its work** The coprocessor does not fetch instructions from memory. Instead RISCV T0, T1 and T2 (TRISC0, TRISC1, TRISC2) *push* 32-bit Tensix instructions into it, one thread each (Tensix T0, T1, T2), and each thread can take up to one instruction per cycle. After pushing, the RISC-V core just keeps running, it does not wait for the coprocessor, so software has to sync the two explicitly.

The common pattern is: one thread drives the Unpackers, one drives the Matrix Unit, and one drives the Packers. Data moves like this:

L1 -> Unpackers -> SrcA / SrcB -> Matrix Unit (FPU) -> Dst -> Packers -> L1

**The registers in between**
1. SrcA and SrcB -> 2 banks each of 64 rows x 16 columns x 19-bit. Unpackers fill one bank while the Matrix Unit uses the other.
2. Dst -> 1024 rows x 16 columns x 16-bit (or 512 x 16 x 32-bit), so 32 KiB.
3. LReg -> 8 registers of 32 lanes x 32-bit, the working registers of the Vector Unit.

**Matrix Unit (FPU)** This is where most of the FLOPS come from. Its main instruction is `MVMUL`:

Dst += SrcB (8x16) @ SrcA (16x16)

That's 8 x 16 x 16 = 2048 multiply-accumulates in one instruction, and it can start one instruction per cycle (5 cycles latency). The inputs are low precision (at most 19 bits: TF32, BF16, FP16 or INT8) and the results accumulate in Dst as FP32, BF16, FP16 or INT32. The multipliers only use at most 5 bits of SrcA magnitude/mantissa and 7 bits of SrcB magnitude/mantissa per pass, so for more precision software can run up to 4 "fidelity phases", trading speed for accuracy.

One more thing: no matter how many threads want it, the Matrix Unit can start only one instruction per cycle.

**Vector Unit (SFPU)** A 32-lane SIMD engine with 32-bit lanes, used for things that are not matrix math, or when all operands need full 32-bit precision. For example `SFPMAD` (VD = VA x VB + VC in FP32) runs at one instruction per cycle with 2 cycles latency.

**Scalar Unit (ThCon)** Integer scalar operations plus 32-bit or 128-bit reads and writes against L1, including the atomics. It can issue one memory request every 3 cycles.

**Supported data formats** (official spec)
1. Floating point -> FP8, FP16, BFLOAT16, FP32 (output only)
2. Block floating point -> BLOCKFP2, BLOCKFP4, BLOCKFP8
3. Integer -> INT8, INT32 (output only)
4. Unsigned integer -> UINT8
5. TensorFloat -> TF32
6. Vector -> VTF19, VFP32

## 6. Ethernet, ARC and PCIe
The last three tile types sit at the edge of the grid and connect the die to everything outside it.

**Ethernet tiles (E)** There are 16 of them, and each one has:
1. 256 KiB of L1
2. 1 baby RISC-V core
3. 2 NoC connections and a NoC overlay
4. 1 x 100 GbE link

These links are meant for connecting Wormhole chips to each other, through QSFP-DD cables, Warp 100 bridges or traces on a circuit board. On the n150 card this is where the 2x QSFP-DD 200G ports and 2x Warp 100 bridges come in, and they are only for connecting to other Tenstorrent Wormhole-based cards. Not every Ethernet tile is wired to something on every board; the unconnected ones still work as a RISC-V + L1, they just never send or receive packets.

**ARC tile** This one has a four-core ARC CPU that runs firmware for chip and board management. It does not run or dispatch your workloads. The host driver talks to it to change clock speed, read telemetry (clock, temperature, power), reset the device without rebooting the host, and upgrade firmware.

**PCIe tile** This is the door to the host: PCIe 4.0 x16. It is the main path for uploading your code and moving data on and off the card. The host can read and write any tile on the NoC, and any tile can read and write host memory (as much as the host's IOMMU allows).

The card exposes 3 memory regions (BARs) to the host: BAR0 = 512 MiB, BAR2 = 1 MiB, BAR4 = 32 MiB. On our n150d, `lspci` shows exactly these sizes, and `tt-smi` reports the link running at PCIe gen 4, width 16. Inside the tile, configurable TLBs turn the host's reads and writes into NoC transactions aimed at one tile (or at a rectangle of Tensix tiles for broadcast writes).

## Extra
Well this is it for the card details but let me show you on the card. when we run this script on our card with ttnn
```python
import ttnn
d = ttnn.open_device(device_id=0)
print('arch:', d.arch())
print('compute grid:', d.compute_with_storage_grid_size())
print('dram grid:', d.dram_grid_size())
ttnn.close_device(d)
```

the expected output here is:

```bash
arch: Arch.WORMHOLE_B0
compute grid: 8-8
dram grid: 12-1
```
You can see that compute grid is 8-8 which results in 64. What? there should be 72. what happened to 8 cores?
well nothing happened to them. I hope you remember harvesting so tt-metal maps wormhole chip with 1 harvested row. and those 8 cores of that row are reserved for fast dispatch.

Well this is for this blog hope it was worth your time. Incase if there is any mistake in the blog or diagram feel free to drop me a message on ([X](https://x.com/HimanshuSh58438))

Some Thanks
1. Jeremy from tenstorrent for giving access to tenstorrent chip.
2. ([corsix](https://x.com/corsix)) for his amazing 7 ([blog](https://www.corsix.org/content/tt-wh-part1)) series on wormhole.
3. ([boopdotpng](https://x.com/boopdotpng)) for his ([blog](https://anuraagw.me/blog/blackhole-architecture))blog on blackhole 

