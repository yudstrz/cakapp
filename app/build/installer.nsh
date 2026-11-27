; Windows installer additions (electron-builder's nsis.include).
;
; An update runs the old version's uninstaller first. When that crashed (#126: 0xC0000374, heap corruption, in the old
; uninstaller itself), electron-builder's installer stopped with "Failed to uninstall old application files" and the
; person had to download the installer by hand. Every file this version needs is written over the old ones next, and
; the app data is never touched (deleteAppDataOnUninstall is off), so a failed old uninstaller is noted and the install
; carries on. Both macros: a per-machine and a per-user install are checked separately.
!include LogicLib.nsh
!include FileFunc.nsh

!macro customUnInstallCheck
  ${If} ${Errors}
    DetailPrint `The old version's uninstaller did not start; installing over it.`
  ${ElseIf} $R0 != 0
    DetailPrint `The old version's uninstaller failed (code $R0); installing over it.`
  ${EndIf}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ${If} ${Errors}
    DetailPrint `The old version's uninstaller did not start; installing over it.`
  ${ElseIf} $R0 != 0
    DetailPrint `The old version's uninstaller failed (code $R0); installing over it.`
  ${EndIf}
  ClearErrors
!macroend

; Manual uninstall offers Full Purge (delete meetings, recordings & local models) vs Keep Data.
; Silent auto-updates (/S without /PURGEDATA) always keep local data untouched.
!macro customUnInstall
  ${GetParameters} $R1
  ClearErrors
  ${GetOptions} $R1 "/PURGEDATA" $R2
  ${IfNot} ${Errors}
    StrCpy $R3 "purge"
  ${ElseIfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "Ingin menghapus semua data lokal Cakapp (rekaman rapat, notulen, pengaturan, dan model AI offline)?$\r$\n$\r$\n• Yes = Uninstall Penuh (hapus aplikasi beserta semua data).$\r$\n• No = Uninstall Aplikasi Saja (data rapat tetap disimpan)." IDNO _cakapp_keep_data
    StrCpy $R3 "purge"
    Goto _cakapp_after_choice
  _cakapp_keep_data:
    StrCpy $R3 "keep"
  _cakapp_after_choice:
  ${Else}
    StrCpy $R3 "keep"
  ${EndIf}

  ${If} $R3 == "purge"
    SetShellVarContext current
    RMDir /r "$APPDATA\Cakapp"
    RMDir /r "$APPDATA\Yogurt"
    RMDir /r "$LOCALAPPDATA\cakapp-updater"
  ${EndIf}
!macroend
