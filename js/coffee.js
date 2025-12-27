window.addEventListener("DOMContentLoaded", () => {
        const paypalEmail = "dh4wes@gmail.com";
        const ensName = "danyel-ii";
        const paypalBase = "https://www.paypal.com/cgi-bin/webscr?cmd=_donations";
        const paypalCTA = document.getElementById("paypal-cta");
        const cryptoCTA = document.getElementById("crypto-cta");
        const copyEns = document.getElementById("copy-ens");
        const showQr = document.getElementById("show-qr");
        const modal = document.getElementById("crypto-modal");
        const copyEnsModal = document.getElementById("copy-ens-modal");
        const copyUri = document.getElementById("copy-uri");
        const qrRoot = document.getElementById("qr");
        const toast = document.getElementById("toast");
        const terminal = document.querySelector(".terminal");
        const waveSvg = document.getElementById("wave-svg");
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let qrInstance = null;
        let toastTimer = null;
        let waveLines = [];
        let wavePointer = { x: 0, y: 0 };

        const updatePaypalLink = () => {
          const url = new URL(paypalBase);
          url.searchParams.set("business", paypalEmail);
          url.searchParams.set("currency_code", "EUR");
          url.searchParams.set("item_name", "Coffee for danyel-ii");
          paypalCTA.href = url.toString();
        };

        const buildCryptoUri = () => `ethereum:${ensName}`;

        const updateCryptoLink = () => {
          cryptoCTA.href = buildCryptoUri();
        };

        const isLikelyMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

        const attemptDeepLink = (uri, immediateFallback = false) => {
          if (immediateFallback) {
            buildQR(buildCryptoUri());
            openModal();
            return;
          }
          const start = Date.now();
          const timer = window.setTimeout(() => {
            if (!document.hidden && Date.now() - start > 650) {
              buildQR(buildCryptoUri());
              openModal();
            }
          }, 700);
          window.location.href = uri;
          window.setTimeout(() => window.clearTimeout(timer), 1400);
        };

        const copyText = async (text) => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
              await navigator.clipboard.writeText(text);
              showToast("Copied");
              return true;
            } catch (err) {
              showToast("Copy failed");
              return false;
            }
          }
          const area = document.createElement("textarea");
          area.value = text;
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.focus();
          area.select();
          let success = false;
          try {
            success = document.execCommand("copy");
          } catch (err) {
            success = false;
          }
          document.body.removeChild(area);
          showToast(success ? "Copied" : "Copy failed");
          return success;
        };

        const showToast = (message) => {
          if (!toast) return;
          toast.textContent = message;
          toast.classList.add("show");
          if (toastTimer) {
            window.clearTimeout(toastTimer);
          }
          toastTimer = window.setTimeout(() => {
            toast.classList.remove("show");
          }, 1400);
        };

        const openModal = () => {
          modal.classList.add("open");
          modal.setAttribute("aria-hidden", "false");
        };

        const closeModal = () => {
          modal.classList.remove("open");
          modal.setAttribute("aria-hidden", "true");
        };

        const buildQR = (uri) => {
          if (!window.QRCode) {
            qrRoot.textContent = uri;
            return;
          }
          if (qrInstance) {
            qrRoot.innerHTML = "";
          }
          qrInstance = new QRCode(qrRoot, {
            text: uri,
            width: 180,
            height: 180,
            colorDark: "#d5ffe8",
            colorLight: "#0a1118",
            correctLevel: QRCode.CorrectLevel.M
          });
        };

        copyEns?.addEventListener("click", () => copyText(ensName));
        copyEnsModal?.addEventListener("click", () => copyText(ensName));
        copyUri?.addEventListener("click", () => copyText(buildCryptoUri()));
        showQr?.addEventListener("click", () => {
          const uri = buildCryptoUri();
          buildQR(uri);
          openModal();
        });

        modal?.addEventListener("click", (event) => {
          const target = event.target;
          if (target && target.dataset && target.dataset.close) {
            closeModal();
          }
        });

        window.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            closeModal();
          }
        });

        cryptoCTA?.addEventListener("click", (event) => {
          event.preventDefault();
          const uri = buildCryptoUri();
          cryptoCTA.href = uri;
          const immediateFallback = !isLikelyMobile();
          attemptDeepLink(uri, immediateFallback);
        });

        updatePaypalLink();
        updateCryptoLink();

        function updateCursorVars(event) {
          const x = event.clientX;
          const y = event.clientY;
          document.documentElement.style.setProperty("--cursor-x", `${x}px`);
          document.documentElement.style.setProperty("--cursor-y", `${y}px`);
        }

        const waveTextLines = [
          "brewchain # nodes / caffeine / relay -----------------------------",
          "latte-core # tx queue / mug / sync ################################",
          "roast daemon # steam / entropy / coil ##############################",
          "cup mesh # froth / filter / drift #################################",
          "bean vault # origin / hash / cipher ###############################",
          "sip path # latency / warmth / loop ################################"
        ];

        const initWaveLines = () => {
          if (!waveSvg) return;
          const width = waveSvg.clientWidth || 600;
          const lineHeight = 22;
          const height = lineHeight * waveTextLines.length;
          waveSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
          waveSvg.innerHTML = "";
          waveLines = waveTextLines.map((label, index) => {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", "transparent");
            path.setAttribute("id", `wave-path-${index}`);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("class", "wave-text");
            const textPath = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
            textPath.setAttribute("href", `#wave-path-${index}`);
            textPath.setAttribute("startOffset", "0%");
            textPath.textContent = label;
            text.appendChild(textPath);

            waveSvg.appendChild(path);
            waveSvg.appendChild(text);

            return {
              path,
              textPath,
              baseY: lineHeight * (index + 1),
              phase: Math.random() * Math.PI * 2
            };
          });
        };

        const updateWavePaths = (time) => {
          if (!waveSvg || !waveLines.length) return;
          const width = waveSvg.viewBox.baseVal.width || waveSvg.clientWidth;
          const pointerY = wavePointer.y;
          waveLines.forEach((line, index) => {
            const distance = Math.abs(pointerY - line.baseY);
            const influence = Math.max(0, 1 - distance / 120);
            const ampBase = 8;
            const amp = prefersReducedMotion ? 0 : ampBase * (1 - influence);
            const step = 32;
            const phase = time * 0.0015 + line.phase;
            let d = `M 0 ${line.baseY}`;
            for (let x = 0; x <= width; x += step) {
              const wave = Math.sin((x / width) * Math.PI * 2 + phase + index * 0.35);
              const y = line.baseY + wave * amp;
              d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
            }
            line.path.setAttribute("d", d);
          });
        };

        initWaveLines();
        updateCursorVars({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });

        if (prefersReducedMotion) {
          updateWavePaths(0);
        } else {
          const tickWave = (time) => {
            updateWavePaths(time);
            window.requestAnimationFrame(tickWave);
          };
          window.requestAnimationFrame(tickWave);
        }

        window.addEventListener("resize", () => {
          initWaveLines();
        }, { passive: true });

        const handlePointer = (event) => {
          updateCursorVars(event);
          if (waveSvg) {
            const rect = waveSvg.getBoundingClientRect();
            wavePointer = {
              x: event.clientX - rect.left,
              y: event.clientY - rect.top
            };
          }
        };

        window.addEventListener("pointermove", handlePointer, { passive: true });
        window.addEventListener("pointerover", handlePointer, { passive: true });
        window.addEventListener("pointerenter", handlePointer, { passive: true });
        document.addEventListener("pointermove", handlePointer, { passive: true, capture: true });
        document.addEventListener("pointerover", handlePointer, { passive: true, capture: true });
        document.addEventListener("pointerenter", handlePointer, { passive: true, capture: true });

        document.querySelectorAll(".glitchable").forEach((el) => {
          el.addEventListener("click", () => {
            el.classList.remove("glitch-hit");
            void el.offsetWidth;
            el.classList.add("glitch-hit");
            window.setTimeout(() => el.classList.remove("glitch-hit"), 500);
          });
        });

        document.querySelectorAll(".wallet-link").forEach((button) => {
          button.addEventListener("click", () => {
            const scheme = button.dataset.wallet;
            const uri = buildCryptoUri();
            const immediateFallback = !isLikelyMobile();
            attemptDeepLink(scheme || uri, immediateFallback);
          });
        });

        if (!window.PIXI) {
          return;
        }

        const pixiRoot = document.getElementById("pixi-bg");
        if (!pixiRoot) {
          return;
        }

        const app = new PIXI.Application();
        app.init({
          resizeTo: window,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 1.5)
        }).then(() => {
          pixiRoot.appendChild(app.canvas);
          const stage = new PIXI.Container();
          app.stage.addChild(stage);

          const glyphLayer = new PIXI.Container();
          const rippleLayer = new PIXI.Graphics();
          const auroraLayer = new PIXI.Container();
          stage.addChild(auroraLayer, glyphLayer, rippleLayer);

          const screenBlendMode = (PIXI.BLEND_MODES && typeof PIXI.BLEND_MODES.SCREEN === "number")
            ? PIXI.BLEND_MODES.SCREEN
            : 4;

          const glyphs = [];
          const auroraBands = [];
          const palette = {
            glow: 0x5af7a6,
            accent: 0x8cfbff
          };

          const glyphChars = "01サトシナカモトሳይፐርፓንክ";
          const count = 320;
          glyphLayer.blendMode = screenBlendMode;
          glyphLayer.alpha = 1;
          rippleLayer.blendMode = screenBlendMode;
          for (let i = 0; i < count; i += 1) {
            const text = new PIXI.Text(glyphChars[Math.floor(Math.random() * glyphChars.length)], {
              fill: palette.glow,
              fontFamily: "SFMono-Regular, ui-monospace, DejaVu Sans Mono, monospace",
              fontSize: 16 + Math.random() * 14
            });
            text.alpha = 0.85 + Math.random() * 0.15;
            text.blendMode = screenBlendMode;
            const velocity = randomVelocity();
            text.x = Math.random() * window.innerWidth;
            text.y = Math.random() * window.innerHeight;
            glyphLayer.addChild(text);
            glyphs.push({
              text,
              vx: velocity.vx,
              vy: velocity.vy,
              phase: Math.random() * Math.PI * 2,
              sway: Math.random() * Math.PI * 2
            });
          }

          const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          const avoidRadius = 150;
          const avoidSoftness = 0.0032;

          const setupAurora = () => {
            const bandCount = 3;
            for (let i = 0; i < bandCount; i += 1) {
              const band = new PIXI.Graphics();
              band.alpha = 0.28 - i * 0.04;
              band.blendMode = screenBlendMode;
              auroraLayer.addChild(band);
              auroraBands.push({
                graphic: band,
                offset: Math.random() * 1000,
                amplitude: 30 + i * 14,
                speed: 0.4 + Math.random() * 0.3
              });
            }
          };

          const drawAurora = (band, width, height, time, amplitude) => {
            band.clear();
            const gradient = [
              { stop: 0, color: palette.glow, alpha: 0.12 },
              { stop: 0.5, color: palette.accent, alpha: 0.2 },
              { stop: 1, color: palette.glow, alpha: 0.08 }
            ];
            const top = height * 0.1;
            const path = [];
            const step = 80;
            for (let x = 0; x <= width + step; x += step) {
              const wave = Math.sin((x / width) * Math.PI * 2 + time * 0.001) * amplitude;
              path.push({ x, y: top + wave });
            }
            band.beginFill(gradient[0].color, gradient[0].alpha);
            band.moveTo(0, 0);
            path.forEach((p) => band.lineTo(p.x, p.y));
            band.lineTo(width, 0);
            band.closePath();
            band.endFill();
          };

          setupAurora();

          const updatePointer = (event) => {
            pointer.x = event.clientX;
            pointer.y = event.clientY;
          };

          window.addEventListener("pointermove", updatePointer, { passive: true });
          window.addEventListener("pointerover", updatePointer, { passive: true });
          window.addEventListener("pointerenter", updatePointer, { passive: true });
          document.addEventListener("pointermove", updatePointer, { passive: true, capture: true });
          document.addEventListener("pointerover", updatePointer, { passive: true, capture: true });
          document.addEventListener("pointerenter", updatePointer, { passive: true, capture: true });
          window.addEventListener("mousemove", updatePointer, { passive: true });
          window.addEventListener("mouseover", updatePointer, { passive: true });
          window.addEventListener("mouseenter", updatePointer, { passive: true });

          const spawnRipple = (x, y) => {
            rippleLayer.clear();
            rippleLayer.lineStyle(1.5, palette.accent, 0.5);
            rippleLayer.drawCircle(x, y, 8);
            rippleLayer.alpha = 1;
            rippleLayer.scale.set(1);
          };

          const paypalPane = document.getElementById("paypal-cta");
          const cryptoPane = document.getElementById("crypto-cta");
          [paypalPane, cryptoPane].forEach((button) => {
            button?.addEventListener("mouseenter", () => {
              const rect = button.getBoundingClientRect();
              spawnRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
            });
          });

          const tick = (ticker) => {
            const delta = ticker.deltaMS / 1000;
            rippleLayer.scale.x += delta * 1.2;
            rippleLayer.scale.y += delta * 1.2;
            rippleLayer.alpha -= delta * 0.6;

            auroraBands.forEach((band, index) => {
              const width = window.innerWidth;
              const height = window.innerHeight;
              const time = ticker.lastTime * band.speed + band.offset + index * 400;
              drawAurora(band.graphic, width, height, time, band.amplitude);
              band.graphic.y = Math.sin(ticker.lastTime * 0.0004 + index) * 12;
            });

            glyphs.forEach((glyph) => {
              const text = glyph.text;
              const dx = text.x - pointer.x;
              const dy = text.y - pointer.y;
              const distance = Math.hypot(dx, dy) || 1;
              const repel = Math.max(0, (avoidRadius - distance) * avoidSoftness);
              const repelX = (dx / distance) * repel * window.innerHeight;
              const repelY = (dy / distance) * repel * window.innerHeight;
              text.x += glyph.vx * delta + Math.sin(glyph.sway + ticker.lastTime * 0.001) * 0.25;
              text.y += glyph.vy * delta + Math.cos(glyph.sway + ticker.lastTime * 0.001) * 0.15;
              text.x += repelX * delta;
              text.y += repelY * delta;
              text.alpha = 0.25 + Math.abs(Math.sin(ticker.lastTime * 0.002 + glyph.phase)) * 0.6;
              if (isOffscreen(text.x, text.y, 60)) {
                const spawn = spawnFromEdge();
                const velocity = randomVelocity();
                text.x = spawn.x;
                text.y = spawn.y;
                glyph.vx = velocity.vx;
                glyph.vy = velocity.vy;
                text.text = glyphChars[Math.floor(Math.random() * glyphChars.length)];
              }
            });
          };

          if (prefersReducedMotion) {
            app.renderer.render(app.stage);
          } else {
            app.ticker.add(tick);
          }
        });

        function spawnFromEdge() {
          const width = window.innerWidth;
          const height = window.innerHeight;
          const edge = Math.floor(Math.random() * 4);
          switch (edge) {
            case 0:
              return { x: Math.random() * width, y: -40 };
            case 1:
              return { x: width + 40, y: Math.random() * height };
            case 2:
              return { x: Math.random() * width, y: height + 40 };
            default:
              return { x: -40, y: Math.random() * height };
          }
        }

        function randomVelocity() {
          const speed = 8 + Math.random() * 18;
          const angle = Math.random() * Math.PI * 2;
          return {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed
          };
        }

        function isOffscreen(x, y, padding) {
          return (
            x < -padding ||
            x > window.innerWidth + padding ||
            y < -padding ||
            y > window.innerHeight + padding
          );
        }

      });
