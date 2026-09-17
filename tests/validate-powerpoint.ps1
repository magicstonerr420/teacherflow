param([string[]]$Files)
$ErrorActionPreference='Stop'
$sdkDir=Join-Path (Get-Location) '.local-runtime/openxml-sdk'
Add-Type -Path (Join-Path $sdkDir 'documentformat.openxml.framework/lib/net8.0/DocumentFormat.OpenXml.Framework.dll')
Add-Type -Path (Join-Path $sdkDir 'documentformat.openxml/lib/net8.0/DocumentFormat.OpenXml.dll')
$validator=[DocumentFormat.OpenXml.Validation.OpenXmlValidator]::new([DocumentFormat.OpenXml.FileFormatVersions]::Office2016)
foreach($file in $Files){
 $deck=[DocumentFormat.OpenXml.Packaging.PresentationDocument]::Open((Join-Path (Get-Location) $file),$false)
 try{
  $issues=@($validator.Validate($deck))
  if($issues.Count){$issues|Select-Object -First 8 Description,@{Name='Part';Expression={$_.Part.Uri}}|ConvertTo-Json -Depth 3;throw "$file has $($issues.Count) OpenXML validation errors"}
  Write-Output "$file : zero OpenXML validation errors"
 }finally{$deck.Dispose()}
}
