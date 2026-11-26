#!/usr/bin/env bash
# =============================================================================
# Crea el servidor Jenkins (EC2) que ejecuta el pipeline de Carta Digital.
#
#   Uso:  infra/crear-jenkins.sh <cidr-permitido>     ej: 190.20.30.40/32
#
# - Amazon Linux 2023, t3.medium, disco cifrado de 30 GB, IMDSv2.
# - Identidad en AWS: rol de instancia LabInstanceProfile (LabRole). Jenkins no
#   guarda claves de AWS: el SDK/CLI usa credenciales temporales del rol.
# - Puerto 8080 abierto SOLO al CIDR indicado (tu IP). Sin SSH: se administra
#   con SSM Session Manager.
# - Instala Jenkins LTS, Docker, Node.js 22, git y los plugins del pipeline, y
#   crea el trabajo "carta-digital" (Jenkinsfile desde Git, revisa cada 2 min).
# =============================================================================
set -euo pipefail
CIDR="${1:?Uso: $0 <cidr-permitido> (ej: 190.20.30.40/32)}"
export AWS_DEFAULT_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
RAMA="${RAMA:-entrega-4}"
REPO_URL="${REPO_URL:-https://github.com/matias725/desarrolo-seguro-.git}"
log() { printf '[jenkins %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=availability-zone,Values=us-east-1a Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)

SG=$(aws ec2 describe-security-groups --filters Name=vpc-id,Values="$VPC" Name=group-name,Values=carta-jenkins --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG" = "None" ]; then
  SG=$(aws ec2 create-security-group --vpc-id "$VPC" --group-name carta-jenkins \
    --description "Jenkins: 8080 solo desde la IP del equipo" --query GroupId --output text)
  log "grupo de seguridad carta-jenkins creado"
fi
aws ec2 authorize-security-group-ingress --group-id "$SG" \
  --ip-permissions "IpProtocol=tcp,FromPort=8080,ToPort=8080,IpRanges=[{CidrIp=$CIDR,Description=equipo}]" >/dev/null 2>&1 || true

EXISTE=$(aws ec2 describe-instances --filters Name=tag:Name,Values=carta-jenkins Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$EXISTE" != "None" ]; then
  log "ya existe: $EXISTE"; exit 0
fi

AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text)
USERDATA=$(cat <<EOF
#!/bin/bash
set -euo pipefail
echo "[jenkins] instalando"
curl -fsSL -o /etc/yum.repos.d/jenkins.repo https://pkg.jenkins.io/redhat-stable/jenkins.repo
rpm --import https://pkg.jenkins.io/redhat-stable/jenkins.io-2023.key
dnf install -y -q java-21-amazon-corretto-headless jenkins docker git nodejs22 nodejs22-npm fontconfig
alternatives --set node /usr/bin/node-22 2>/dev/null || ln -sf /usr/bin/node-22 /usr/local/bin/node
ln -sf /usr/bin/npm-22 /usr/local/bin/npm 2>/dev/null || true
systemctl enable --now docker
usermod -aG docker jenkins

# Plugins del pipeline (antes del primer arranque)
curl -fsSL -o /opt/jenkins-plugin-manager.jar \
  https://github.com/jenkinsci/plugin-installation-manager-tool/releases/download/2.13.2/jenkins-plugin-manager-2.13.2.jar
mkdir -p /var/lib/jenkins/plugins /var/lib/jenkins/init.groovy.d
java -jar /opt/jenkins-plugin-manager.jar --war /usr/share/java/jenkins.war \
  --plugin-download-directory /var/lib/jenkins/plugins \
  --plugins workflow-aggregator git junit timestamper pipeline-stage-view pipeline-graph-view

# Trabajo "carta-digital": Jenkinsfile desde Git, revisa la rama cada 2 minutos
cat > /var/lib/jenkins/init.groovy.d/crear-trabajo.groovy <<'GROOVY'
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import hudson.plugins.git.GitSCM
import hudson.plugins.git.BranchSpec
import hudson.triggers.SCMTrigger
def j = Jenkins.get()
if (j.getItem('carta-digital') == null) {
  def scm = new GitSCM(GitSCM.createRepoList('$REPO_URL', null), [new BranchSpec('*/$RAMA')], null, null, [])
  def flujo = new CpsScmFlowDefinition(scm, 'carta-digital/Jenkinsfile')
  flujo.setLightweight(true)
  def trabajo = j.createProject(WorkflowJob, 'carta-digital')
  trabajo.setDefinition(flujo)
  trabajo.setDescription('Carta Digital: pruebas, análisis de seguridad y despliegue en AWS')
  trabajo.addProperty(new PipelineTriggersJobProperty([new SCMTrigger('H/2 * * * *')]))
  trabajo.save()
}
GROOVY
chown -R jenkins:jenkins /var/lib/jenkins
systemctl enable --now jenkins
echo "[jenkins] listo"
EOF
)

ID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t3.medium --subnet-id "$SUBNET" \
  --security-group-ids "$SG" --iam-instance-profile Name=LabInstanceProfile \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=2 \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,Encrypted=true}' \
  --user-data "$USERDATA" \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=carta-jenkins},{Key=Proyecto,Value=carta-digital}]' \
  --query 'Instances[0].InstanceId' --output text)
log "instancia $ID creada; esperando que arranque…"
aws ec2 wait instance-running --instance-ids "$ID"
IP=$(aws ec2 describe-instances --instance-ids "$ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
log "Jenkins estará en http://$IP:8080 en ~5 minutos"
log "Clave inicial: aws ssm send-command (cat /var/lib/jenkins/secrets/initialAdminPassword)"
