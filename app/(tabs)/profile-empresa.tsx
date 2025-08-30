import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ListItem } from '../../components/ListItem';

export default function PerfilEmpresa() {
  const router = useRouter();
  return (
    <View style={{ flex:1, backgroundColor:'#f5f5f5' }}>
      <View style={{ height:8 }} />
      <ListItem
        title="Gestión empresa"
        subtitle="Aquí se modifican todos los datos de la empresa (nombre, servicio, imagen, dirección, teléfono, descripción y ciudad)."
        onPress={() => router.push('/profile-empresa/gestion')}
      />
      <View style={{ height:8 }} />
      <ListItem
        title="Modificar tramos horarios apertura"
        subtitle="Verás los días y franjas horarias actuales; podrás añadir, editar o eliminar."
        onPress={() => router.push('/profile-empresa/horarios')}
      />
    </View>
  );
}
