ARG IRIS_IMAGE=iris-community:2027.1.0AI.109.0
FROM ${IRIS_IMAGE}

USER root

# Setup application directory
WORKDIR /opt/irisapp
RUN mkdir -p /opt/irisapp && chown -R irisowner:irisowner /opt/irisapp

USER irisowner

# Copy source code, IPM descriptor, CPF merge, and startup script
COPY src /opt/irisapp/src
COPY module.xml /opt/irisapp/module.xml
COPY merge.cpf /opt/irisapp/merge.cpf
COPY iris.script /tmp/iris.script

# Initialize IRIS, merge CPF config, run script, and compile classes
RUN iris start IRIS && \
    iris merge IRIS /opt/irisapp/merge.cpf && \
    iris session IRIS < /tmp/iris.script && \
    iris stop IRIS quietly
