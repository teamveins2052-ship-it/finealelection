/**
 * Election Rally System for Don't Look Up
 * Transforms the scene into an animated election campaign rally:
 * - Waving election flags & candidate banners held in hands
 * - Campaign placards with hand-drawn comic slogans
 * - Forehead bands / bandanas on rally workers & voters
 * - Candidate speech from a wooden soapbox with a megaphone
 * - Responsive crowd rally chants & speech bubbles
 */

(function () {
  function initElectionRally() {
    if (!window.__app || !window.THREE || !window.__app.crowd || !window.__app.crowd.agents) {
      setTimeout(initElectionRally, 200);
      return;
    }

    const { scene, crowd, camera, giant } = window.__app;
    const THREE = window.THREE;

    // Palette: Hand-drawn ink style with political rally banner colors
    const rallyColors = [
      { fill: 0xe63946, text: '#ffffff', name: 'Red Liberty' },
      { fill: 0x1d3557, text: '#ffffff', name: 'Blue Alliance' },
      { fill: 0xf77f00, text: '#14140f', name: 'Saffron Reform' },
      { fill: 0x2a9d8f, text: '#ffffff', name: 'Green Unity' },
      { fill: 0xf4f3ef, text: '#14140f', name: 'White Neutral' },
      { fill: 0xd90429, text: '#ffffff', name: 'Victory Red' }
    ];

    const slogans = [
      "VOTE FOR CHANGE!",
      "NO MORE GIANTS!",
      "ELECTION 2026 ★",
      "VOTE #1!",
      "POWER TO CROWD!",
      "LOWER OUR TAXES!",
      "STAND TOGETHER!",
      "OUR TIME NOW!",
      "DON'T LOOK DOWN!",
      "MARCH FOR US!"
    ];

    const candidateSpeeches = [
      "Citizens! The election is upon us! 📢",
      "Why should giants stand upon our backs?",
      "A vote for us is a vote for freedom!",
      "No more unfair taxes! No more stepping on us!",
      "Together, the crowd is taller than any giant!",
      "Vote Candidate #1 on Election Day!",
      "We will build a future where everyone looks up!",
      "Lend me your votes, my friends! 📣"
    ];

    const crowdChants = [
      "Hear! Hear!",
      "Vote! Vote!",
      "Down with the giant!",
      "Four more steps!",
      "We want change!",
      "Louder! 📢",
      "Speech!",
      "Yeahhhh!",
      "No more taxes!",
      "Our candidate!",
      "Together!"
    ];

    // Helper: Create hand-drawn style canvas texture for placards and flags
    function createSloganTexture(text, bgColor = '#ffffff', textColor = '#14140f', isFlag = false) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = isFlag ? 160 : 180;
      const ctx = canvas.getContext('2d');

      // Background with soft vintage paper tone
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Comic hand-drawn border
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#14140f';
      ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

      // Inner decorative border
      ctx.lineWidth = 3;
      ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

      // Bold text
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 28px "Nunito", "Luckiest Guy", sans-serif';

      const words = text.split(' ');
      if (words.length <= 2) {
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      } else {
        const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
        const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
        ctx.fillText(line1, canvas.width / 2, canvas.height / 2 - 22);
        ctx.fillText(line2, canvas.width / 2, canvas.height / 2 + 22);
      }

      if (isFlag) {
        ctx.font = '24px sans-serif';
        ctx.fillText("★", 32, 34);
        ctx.fillText("★", canvas.width - 32, canvas.height - 34);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      return tex;
    }

    // Material caches
    const inkMat = new THREE.MeshBasicMaterial({ color: 0x14140f });
    const woodMat = new THREE.MeshBasicMaterial({ color: 0xd4a373 });
    const podiumMat = new THREE.MeshBasicMaterial({ color: 0xbc6c25 });

    const wavingFlags = [];

    // Attach election gear directly to agent's skeleton nodes (head, arms)
    function outfitAgent(agent, index) {
      if (agent.__electionOutfit) return;
      agent.__electionOutfit = true;

      const view = agent.view;
      if (!view || !view.head) return;

      const head = view.head;
      const armR = view.armR;
      const armL = view.armL;

      // 1. FOREHEAD BANDS (Headbands / campaign bandanas)
      // 70% of agents wear headbands
      if (index % 10 < 7) {
        const colorObj = rallyColors[index % rallyColors.length];
        const bandGroup = new THREE.Group();

        // Band ring around the forehead (Sphere radius is 0.235)
        const bandGeo = new THREE.TorusGeometry(0.244, 0.038, 8, 22);
        const bandMat = new THREE.MeshBasicMaterial({ color: colorObj.fill });
        const bandMesh = new THREE.Mesh(bandGeo, bandMat);

        // Slanted forward slightly onto forehead (forward is +Z)
        bandMesh.rotation.x = Math.PI / 2 + 0.18;
        bandMesh.scale.set(1.04, 1.04, 0.45);
        bandGroup.add(bandMesh);

        // Black ink outline ring for comic silhouette
        const outlineGeo = new THREE.TorusGeometry(0.248, 0.016, 8, 22);
        const outlineMesh = new THREE.Mesh(outlineGeo, inkMat);
        outlineMesh.rotation.x = Math.PI / 2 + 0.18;
        outlineMesh.scale.set(1.06, 1.06, 0.48);
        bandGroup.add(outlineMesh);

        // Tied knot ribbon tails at the back of the head
        const tailGeo = new THREE.PlaneGeometry(0.09, 0.22);
        const tailMesh = new THREE.Mesh(tailGeo, bandMat);
        tailMesh.position.set(0.12, -0.06, -0.22);
        tailMesh.rotation.set(0.25, 0.5, 0.15);
        bandGroup.add(tailMesh);

        const tail2Mesh = new THREE.Mesh(tailGeo, bandMat);
        tail2Mesh.position.set(0.18, -0.08, -0.21);
        tail2Mesh.rotation.set(0.4, 0.6, -0.1);
        bandGroup.add(tail2Mesh);

        // Sits at head level
        bandGroup.position.set(0, 0.04, 0.02);
        head.add(bandGroup);
      }

      // 2. PLACARD BANNERS ON STICKS ("VOTE", "CHANGE", etc.)
      // 30% of agents hold signs in their right hand
      if (index % 3 === 1 && armR) {
        const placardGroup = new THREE.Group();
        const slogan = slogans[index % slogans.length];
        const colorObj = rallyColors[(index + 1) % rallyColors.length];

        // Wooden pole held in arm
        const poleGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.05, 8);
        const poleMesh = new THREE.Mesh(poleGeo, woodMat);
        poleMesh.position.y = 0.52;
        placardGroup.add(poleMesh);

        // Placard board (front and back visible)
        const signTex = createSloganTexture(slogan, '#ffffff', '#14140f');
        const signMat = new THREE.MeshBasicMaterial({ map: signTex });
        const signGeo = new THREE.BoxGeometry(0.58, 0.38, 0.025);
        const signMesh = new THREE.Mesh(signGeo, signMat);
        signMesh.position.y = 0.95;
        placardGroup.add(signMesh);

        // Black outline box
        const boardOutlineMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.595, 0.395, 0.015),
          inkMat
        );
        boardOutlineMesh.position.y = 0.95;
        boardOutlineMesh.scale.set(1.02, 1.02, 0.8);
        placardGroup.add(boardOutlineMesh);

        // Attach to arm node so it swings as they walk
        placardGroup.position.set(0.05, -0.22, 0.1);
        placardGroup.rotation.z = -0.15;
        placardGroup.rotation.x = 0.2;
        armR.add(placardGroup);
      }

      // 3. WAVING CAMPAIGN FLAGS
      // 25% of agents carry waving flags in their left hand
      if (index % 4 === 2 && armL) {
        const flagGroup = new THREE.Group();
        const colorObj = rallyColors[index % rallyColors.length];

        // Tall flagpole
        const poleGeo = new THREE.CylinderGeometry(0.016, 0.016, 1.35, 8);
        const poleMesh = new THREE.Mesh(poleGeo, woodMat);
        poleMesh.position.y = 0.68;
        flagGroup.add(poleMesh);

        // Gold finial topper
        const topMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.005, 0.08, 8),
          new THREE.MeshBasicMaterial({ color: 0xf77f00 })
        );
        topMesh.position.y = 1.37;
        flagGroup.add(topMesh);

        // Waving flag cloth
        const flagColorHex = colorObj.name.includes('Red') ? '#e63946' : (colorObj.name.includes('Blue') ? '#1d3557' : '#f77f00');
        const flagTex = createSloganTexture("VOTE ★", flagColorHex, '#ffffff', true);
        const flagMat = new THREE.MeshBasicMaterial({ map: flagTex });
        const flagGeo = new THREE.PlaneGeometry(0.52, 0.34, 6, 4);
        const flagMesh = new THREE.Mesh(flagGeo, flagMat);
        flagMesh.position.set(0.27, 1.15, 0);
        flagGroup.add(flagMesh);

        // Attach to left arm
        flagGroup.position.set(-0.05, -0.22, 0.1);
        flagGroup.rotation.z = 0.18;
        flagGroup.rotation.x = 0.15;
        armL.add(flagGroup);

        wavingFlags.push({ mesh: flagMesh, offset: index * 0.8 });
      }
    }

    // 4. CAMPAIGN SOAPBOX PODIUM & CANDIDATE SPEAKER
    // Place an election soapbox podium in the clearing near the giant foot
    const podiumGroup = new THREE.Group();
    podiumGroup.position.set(4.2, 0.16, -20.5);

    // Soapbox crate
    const crateGeo = new THREE.BoxGeometry(0.9, 0.34, 0.9);
    const crateMesh = new THREE.Mesh(crateGeo, podiumMat);
    crateMesh.castShadow = true;
    podiumGroup.add(crateMesh);

    // Crate outline
    const crateOutline = new THREE.Mesh(
      new THREE.BoxGeometry(0.93, 0.36, 0.93),
      inkMat
    );
    podiumGroup.add(crateOutline);

    // Campaign banner on the crate ("ELECTION 2026")
    const crateTex = createSloganTexture("VOTE 2026", '#e63946', '#ffffff');
    const crateBanner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.24),
      new THREE.MeshBasicMaterial({ map: crateTex })
    );
    crateBanner.position.set(0, 0.01, 0.47);
    podiumGroup.add(crateBanner);

    // Candidate Megaphone on a stand
    const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.72, 8), inkMat);
    standPole.position.set(-0.25, 0.52, 0.22);
    podiumGroup.add(standPole);

    const megaphoneGeo = new THREE.CylinderGeometry(0.09, 0.03, 0.26, 12);
    const megaphoneMat = new THREE.MeshBasicMaterial({ color: 0xe63946 });
    const megaphone = new THREE.Mesh(megaphoneGeo, megaphoneMat);
    megaphone.rotation.z = Math.PI / 2;
    megaphone.rotation.y = -0.35;
    megaphone.position.set(-0.25, 0.88, 0.22);
    podiumGroup.add(megaphone);

    scene.add(podiumGroup);

    // Outfit all existing agents
    crowd.agents.forEach((agent, i) => outfitAgent(agent, i));

    // Watch for dynamically spawned agents
    const originalAddCitizen = crowd.addCitizen ? crowd.addCitizen.bind(crowd) : null;
    if (originalAddCitizen) {
      crowd.addCitizen = function () {
        const agent = originalAddCitizen();
        if (agent) {
          outfitAgent(agent, crowd.agents.length - 1);
        }
        return agent;
      };
    }

    // 5. CAMPAIGN ORATORY & SPEECH BUBBLE CYCLE
    let speechTimer = 0;
    let speechIndex = 0;

    function triggerElectionSpeeches(now) {
      if (now - speechTimer < 3400) return;
      speechTimer = now;

      if (!crowd.agents || crowd.agents.length === 0) return;

      // 1. Speaker candidate delivers speech
      const candidateSpeech = candidateSpeeches[speechIndex % candidateSpeeches.length];
      speechIndex++;

      const speaker = crowd.agents[0];
      if (speaker && speaker.bubble && typeof speaker.bubble.show === 'function') {
        speaker.bubble.show(candidateSpeech, 3.2);
      }

      // 2. Supporters chant back in unison across the doubled crowd
      setTimeout(() => {
        const supporters = [
          crowd.agents[2], crowd.agents[6], crowd.agents[12],
          crowd.agents[20], crowd.agents[32], crowd.agents[48],
          crowd.agents[64], crowd.agents[85]
        ].filter(Boolean);

        supporters.forEach((supporter, idx) => {
          if (supporter && supporter.bubble && typeof supporter.bubble.show === 'function') {
            const chant = crowdChants[(speechIndex + idx) % crowdChants.length];
            setTimeout(() => {
              supporter.bubble.show(chant, 2.4);
            }, idx * 240);
          }
        });
      }, 750);
    }

    // 6. ANIMATION LOOP: Wave the flags smoothly in the election breeze
    let lastTime = performance.now();
    function animateRally() {
      requestAnimationFrame(animateRally);
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Wave the flags
      wavingFlags.forEach(f => {
        const time = now * 0.005 + f.offset;
        f.mesh.rotation.y = Math.sin(time) * 0.25;
        f.mesh.rotation.z = Math.cos(time * 0.75) * 0.09;
      });

      // Run election speech cycle
      triggerElectionSpeeches(now);
    }
    requestAnimationFrame(animateRally);

    // 7. EXPOSE RALLY INTERACTION HANDLERS FOR BUTTONS
    window.__electionRally = {
      triggerRallyMarch: function () {
        if (crowd.agents && crowd.agents.length > 0) {
          crowd.agents.slice(0, 10).forEach((agent, i) => {
            if (agent.bubble && typeof agent.bubble.show === 'function') {
              const slogansShout = [
                "VOTE! VOTE! VOTE!",
                "MARCH ON!",
                "WE WANT CHANGE!",
                "FREEDOM!",
                "POWER TO US! 📢",
                "ELECTION DAY!",
                "DOWN WITH GIANTS!",
                "VOTE #1!"
              ];
              agent.bubble.show(slogansShout[i % slogansShout.length], 3.2);
            }
          });
        }
        if (window.__app.coins && typeof window.__app.coins.toss === 'function') {
          for (let k = 0; k < 6; k++) {
            const rx = (Math.random() - 0.5) * 14;
            const rz = (Math.random() - 0.5) * 10 - 22;
            window.__app.coins.toss(rx, 1.4, rz, 0, -26);
          }
        }
      },
      triggerCandidatePromise: function () {
        if (crowd.agents && crowd.agents[0] && crowd.agents[0].bubble) {
          crowd.agents[0].bubble.show("My fellow citizens: Cast your vote for the future! 📣", 3.8);
          setTimeout(() => {
            crowd.agents.slice(1, 5).forEach((agent, i) => {
              if (agent.bubble) {
                const chants = ["Four more steps!", "Hear, hear!", "Vote #1!", "Change is now!"];
                agent.bubble.show(chants[i % chants.length], 2.6);
              }
            });
          }, 700);
        }
      }
    };

    console.log("Election Rally System initialized: banners, flags, headbands, and candidate speeches active!");
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initElectionRally);
  } else {
    initElectionRally();
  }
})();
