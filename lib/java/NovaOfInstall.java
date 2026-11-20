// Ayudante de Nova PX: ejecuta el instalador oficial de OptiFine sin ventana.
// Uso: java -Djava.awt.headless=true -cp OptiFine.jar:<carpeta de esta clase> NovaOfInstall <carpeta .minecraft>
public class NovaOfInstall {
    public static void main(String[] args) throws Exception {
        optifine.Installer.doInstall(new java.io.File(args[0]));
        System.out.println("NOVA_OF_OK");
    }
}
