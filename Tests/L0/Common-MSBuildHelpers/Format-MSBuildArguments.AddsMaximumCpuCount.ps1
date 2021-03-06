[CmdletBinding()]
param()

# Arrange.
. $PSScriptRoot\..\..\lib\Initialize-Test.ps1
Microsoft.PowerShell.Core\Import-Module $PSScriptRoot\..\..\..\Tasks\MSBuild\ps_modules\MSBuildHelpers

# Act.
$actual = Format-MSBuildArguments -MSBuildArguments 'Some arguments' -MaximumCpuCount

# Assert.
Assert-AreEqual "Some arguments /m" $actual
