"""
Despliega pnkSecurity (rama "mejoras") en una instancia EC2 de AWS.

Uso:
    pip install boto3
    # Credenciales de AWS Academy en ~/.aws/credentials o en variables de
    # entorno (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN).
    # NUNCA se guardan en el repositorio.
    python deploy/desplegar_aws.py [--vulnerable] [--region us-east-1]

Crea (o reutiliza):
  - Security Group "pnk-sg": 80/443 abiertos; 22 y 8080 solo para la IP de
    quien ejecuta el script.
  - IP elástica, para que la URL https://<ip>.sslip.io sea estable.
  - Instancia Ubuntu 24.04 aprovisionada con deploy/user-data.sh.
"""
import argparse
import pathlib
import urllib.request

import boto3

NOMBRE = "pnkSecurity-mejoras"
SG_NOMBRE = "pnk-sg"
AMI_SSM = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"


def mi_ip():
    return urllib.request.urlopen("https://checkip.amazonaws.com", timeout=10).read().decode().strip()


def security_group(ec2, ip):
    vpc = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])["Vpcs"][0]["VpcId"]
    existentes = ec2.describe_security_groups(Filters=[{"Name": "group-name", "Values": [SG_NOMBRE]}])["SecurityGroups"]
    if existentes:
        sg = existentes[0]["GroupId"]
    else:
        sg = ec2.create_security_group(GroupName=SG_NOMBRE, VpcId=vpc,
                                       Description="pnkSecurity: web publica, SSH/8080 solo IP del tester")["GroupId"]
    reglas = [
        (80, "0.0.0.0/0", "HTTP (redirige a HTTPS)"),
        (443, "0.0.0.0/0", "HTTPS"),
        (22, f"{ip}/32", "SSH administracion"),
        (8080, f"{ip}/32", "Version original vulnerable - solo testing"),
    ]
    for puerto, cidr, desc in reglas:
        try:
            ec2.authorize_security_group_ingress(GroupId=sg, IpPermissions=[{
                "IpProtocol": "tcp", "FromPort": puerto, "ToPort": puerto,
                "IpRanges": [{"CidrIp": cidr, "Description": desc}]}])
        except ec2.exceptions.ClientError as ex:
            if "InvalidPermission.Duplicate" not in str(ex):
                raise
    return sg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="us-east-1")
    ap.add_argument("--tipo", default="t3.small")
    ap.add_argument("--rama", default="mejoras")
    ap.add_argument("--key", default="vockey", help="Key pair para SSH")
    ap.add_argument("--vulnerable", action="store_true",
                    help="Publica también la versión original en :8080 (restringido a tu IP)")
    args = ap.parse_args()

    ec2 = boto3.client("ec2", region_name=args.region)
    ssm = boto3.client("ssm", region_name=args.region)

    ip = mi_ip()
    sg = security_group(ec2, ip)
    eip = ec2.allocate_address(Domain="vpc", TagSpecifications=[{
        "ResourceType": "elastic-ip", "Tags": [{"Key": "Name", "Value": NOMBRE}]}])
    dominio = eip["PublicIp"].replace(".", "-") + ".sslip.io"

    user_data = (pathlib.Path(__file__).with_name("user-data.sh").read_text(encoding="utf-8")
                 .replace("__DOMINIO__", dominio)
                 .replace("__RAMA__", args.rama)
                 .replace("__VULNERABLE__", "1" if args.vulnerable else "0"))

    ami = ssm.get_parameter(Name=AMI_SSM)["Parameter"]["Value"]
    inst = ec2.run_instances(
        ImageId=ami, InstanceType=args.tipo, MinCount=1, MaxCount=1,
        KeyName=args.key, SecurityGroupIds=[sg], UserData=user_data,
        MetadataOptions={"HttpTokens": "required", "HttpEndpoint": "enabled"},  # IMDSv2
        BlockDeviceMappings=[{"DeviceName": "/dev/sda1",
                              "Ebs": {"VolumeSize": 12, "VolumeType": "gp3", "Encrypted": True}}],
        TagSpecifications=[{"ResourceType": "instance", "Tags": [{"Key": "Name", "Value": NOMBRE}]}],
    )["Instances"][0]["InstanceId"]
    print("Instancia:", inst, "- esperando estado running...")
    ec2.get_waiter("instance_running").wait(InstanceIds=[inst])
    ec2.associate_address(InstanceId=inst, AllocationId=eip["AllocationId"])

    print(f"IP elástica : {eip['PublicIp']}")
    print(f"URL         : https://{dominio}/index.php?id=1  (disponible en ~5-8 min)")
    if args.vulnerable:
        print(f"Original    : http://{eip['PublicIp']}:8080/index.php?id=1  (solo desde {ip})")


if __name__ == "__main__":
    main()
