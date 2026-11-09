; Al actualizar desde Nova PX Event Launcher a Sagitta: se quitan los accesos directos con el nombre anterior
; (el nuevo instalador crea los de "Sagitta"), para que no queden duplicados.
!macro customInstall
  Delete "$DESKTOP\Nova PX Event Launcher.lnk"
  Delete "$SMPROGRAMS\Nova PX Event Launcher.lnk"
!macroend
