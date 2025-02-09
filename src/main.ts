import { app, Menu, MenuItem, nativeImage, Tray } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as yaml from "js-yaml";

let tray: Tray | null = null;
let selectedContext: string | null = null;
let currentContext:string | null = null;

function getKubeConfigPath(): string {
  return process.env.KUBECONFIG || path.join(os.homedir(), ".kube");
}

function getConfigFilePath(): string {
  return path.join(getKubeConfigPath(), "config");
}

function listKubeConfigFiles(): string[] {
  const kubePath = getKubeConfigPath();
  if (!fs.existsSync(kubePath)) return [];

  return fs
    .readdirSync(kubePath)
    .filter(file => file.match(/\.(yml|yaml|json)$/))
    .map(file => path.join(kubePath, file));
}

function parseKubeConfig(filePath: string): { name: string; contexts: string[], fullPath: string } | null {
  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const config = yaml.load(fileContent) as any;

    if (!config || config.kind !== "Config" || !config.contexts) return null;

    const contexts = config.contexts.map((ctx: any) => ctx.name);
    return { name: path.basename(filePath), contexts, fullPath: filePath };
  } catch (error) {
    console.error(`Error: ${filePath} file cannot read.`, error);
    return null;
  }
}

function getCurrentContext(): string | null {
  return currentContext;
}

function setKubeContext(sourceFile: string, selectedContextName: string) {
  try {
    const fileContent = fs.readFileSync(sourceFile, "utf-8");
    const config = yaml.load(fileContent) as any;

    if (!config || !config.contexts) {
      console.error("Invalid kubeconfig file.");
      return;
    }

    if (!config.contexts.some((ctx: any) => ctx.name === selectedContextName)) {
      console.error(`Context ${selectedContextName} not found.`);
      return;
    }

    config["current-context"] = selectedContextName;
    fs.writeFileSync(getConfigFilePath(), yaml.dump(config), "utf-8");

    currentContext = `${sourceFile}::${selectedContextName}`;

    updateTrayMenu(); // Update tray menu

    console.log(`New kubeconfig file creared: ${getConfigFilePath()}`);
    console.log(`Default context: ${selectedContextName}`);
  } catch (error) {
    console.error("Context change error:", error);
  }
}

function createTray() {
  
  const trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAGzUExURSzMcFDUiN736YvjsSzLcGLZlN/36b/v1GPZldj25ZXlty7McSzMb3TdoOT57WjamIrisFfWjc/z38Xx2E/UiEnSg9n25t336LDsys3z3cjy2U7UhyvLb0rThNr25uD36vj9+/v+/LXtzDrPeWjameH465/nver68YXhrEfSgtj15JjmuXbeouP47GbZlzbOdlPVio3jsuH46lzXkD7QfDvPejXOdZbluFjWjrvu0YDgqYzjsVbWjMLw1kbSgpHktOn68MLw1bzv0arqxbbtzXLcn57nvW3bnDLNdDHNc3DcnqnqxVvXkHrepLftzpPltjXOdkbSgaLov7TtzHvfpWrbmq7ryLXtzbnu0KrqxljWjeL468ny2p3nvMDw1Oj573HcnpLktfD79ZrmuofiribKbFHUiZTltpHktdv25yTKaifKbMjx2pznvL/v02bal+3785nmupvnuz3Pe9f148jy2ovjsDDNc5DktPH89kDQfTzQe7nuz8ry2zDMcjDNcs/z3r3v0mHZlETRgEXSgTnPeOH36vL89ub57u/79OX57W/cnfn+++r68OX57oHgqf///1saE5oAAAABYktHRJB4Co4MAAAAB3RJTUUH6QIIDQY1StprkwAAAPlJREFUGNNjYGBkYmZhZWPn4OTi5uHl42cACggICgmLiIrBBcQlJKWkZWTlYAIi8gqKSsowARUGGRFVSTV1DW5NLW1uGR1dPQZ9AyZDZSUjYxNJJVMzc3kLBksrNmsZG3FbO3sHRycHZ2UGF1c3dw9PL28fU19vP39NboaAwCC/YOcQU8/QsPCI8MgoBhnG6JjYuPgEhsQkb+3kREaQw1JS08TTuTMyA7NSsxmAAvI5uXlG+Qz2Bd6FRRrFIIESl1L1svKKyrhwv6IqkBbD8uqaWhN7ccY6z3pukEBhIGtDo7K9fFNzYEsr0C9t7R2dXd3cFT29fR3y/QD0sDaEYoMmmQAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNS0wMi0wOFQxMzowNjo0NCswMDowMB1s35oAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjUtMDItMDhUMTM6MDY6NDQrMDA6MDBsMWcmAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI1LTAyLTA4VDEzOjA2OjUzKzAwOjAwMil46QAAAABJRU5ErkJggg==');
  tray = new Tray(trayIcon);

  updateTrayMenu(); // Menü oluştur
}

function updateTrayMenu() {
  if (!tray) return;

  const menu = new Menu();
  selectedContext = getCurrentContext(); // Seçili context'i al

  console.log("Seçili context:", selectedContext);

  const files = listKubeConfigFiles()
    .map(parseKubeConfig)
    .filter(Boolean) as { name: string; contexts: string[], fullPath: string }[];

  let isAnyChecked = false; // ✅ Sadece tek bir checked olacak!

  if (files.length === 0) {
    menu.append(new MenuItem({ label: "Kubeconfig dosyası bulunamadı", enabled: false }));
  } else {
    files.forEach((file, index) => {
      menu.append(new MenuItem({ label: `📁 ${file.name}`, enabled: false }));

      file.contexts.forEach(context => {
        const contextId = `${file.fullPath}::${context}`;

        const isChecked = contextId == currentContext;

        console.log(selectedContext + " ...... " + currentContext);

        menu.append(new MenuItem({
          label: `   🌐 ${context}`,
          type: "radio",
          checked: isChecked,
          click: () => setKubeContext(file.fullPath, context),
          id: contextId
        }));
      });

      if (index < files.length - 1) {
        menu.append(new MenuItem({ type: "separator" }));
      }

    });

    menu.append(new MenuItem({
      label: ` ❌ Quit`,
      click: () => app.quit(),
    }));
  }

  tray.setContextMenu(menu);
}

function folderwatcher() {

  const kubePath = getKubeConfigPath();
  if (!fs.existsSync(kubePath)) return;

  fs.watch(kubePath, (eventType, filename) => {
    if (eventType === "rename" || eventType === "change") {
      console.log(`Kubeconfig dosyası değişti: ${filename}`);
      updateTrayMenu();
    }
  });

}


app.whenReady().then(()=>{
  createTray();
  folderwatcher();
});
